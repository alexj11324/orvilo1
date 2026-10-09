# Topic titles from the ACP agent (`session_info_update`)

External CLI/ACP agents name their own sessions through the ACP standard:
`session/update` with `sessionUpdate: 'session_info_update'` and `{ title?: string | null }`
(omitted = unchanged, `null` = cleared; agent-initiated; no capability needed).
`claude-agent-acp` generates one title per session at turn end; `codex-acp` maps
`thread/name/updated` to it. Orvilo now adopts that title instead of asking a cloud model.

## Precedence (highest first)

1. A title the user set by hand (`updateTopicTitle`) is never overwritten automatically.
2. The latest non-empty title the agent reported (`applyAgentTopicTitle`).
3. Built-in Orvilo agent only: generated with that agent's own model (`summaryTopicTitle`).
4. Slice of the first user message: the placeholder shown until (2) arrives.

Precedence for (2)-(4) lives in `resolveTopicTitleSource`; "may the agent replace the current
title" lives in `canAgentRetitleTopic` (`src/store/chat/slices/topic/topicTitle.ts`).

## Data flow

```
bridge stdout -> AcpAgentSession.forwardSessionTitle (packages/heterogeneous-agents)
  -> options.onSessionTitle -> HeterogeneousAgentImpl.broadcastSessionTitle
  -> IPC 'heteroAgentSessionTitle' { sessionId, title }
  -> sessionTitleWatcher (renderer, outlives the run) -> chat store applyAgentTopicTitle
main -> IPC 'heteroAgentSessionTitleEnd' { sessionId } when no title can arrive any more
```

- One parser, `parseAcpSessionTitle` (`adapters/acpCommon.ts`): only a non-blank string title
  counts; `null`, missing, blank, non-string and `_meta`-only updates (the bundled Prime agent
  sends many) are ignored. See "Threat model" for how the text is sanitised (single line, invisible
  characters stripped, 100 code points).
- It is called once, in the shared `AcpAgentSession` base, so every ACP runtime (standard
  bridges, TRAE, Droid, Devin, Cursor, Grok) behaves the same. Replayed history (before the
  prompt starts, or `_meta.isReplay`) and repeats of the same title are ignored.
- It is a side channel, not a stream event. The event stream is also ingested by the server
  (`aiAgent.heteroIngest`, whose `AgentStreamEventSchema.type` is a closed `z.enum`, and the
  CLI `orvilo hetero exec` path): an unknown `session_info` type would fail the whole batch.
  The title therefore never enters `onEvents`. The one-shot `spawnAgent` CLI path passes no
  `onSessionTitle`, so titles are dropped there.

## Title source marker (persisted)

`topics.metadata` is a free-form `jsonb` column and `TopicModel.updateMetadata` shallow-merges the
patch under a row lock, so writing `{ titleSource }` keeps every other metadata key. The key is
listed in `chatTopicMetadataUpdateSchema` (`packages/types/src/topic/topic.ts`).

`#writeTopicTitle` (topic slice) writes `metadata.titleSource` and then the title:
`updateTopicTitle` -> `user`, `applyAgentTopicTitle` -> `agent`, model / slice paths -> `auto`.
The marker is written before the title (a hand rename is protected from the first moment) and only
when it differs from the stored one, an unset value counting as `auto`, so ordinary automatic
titling costs no extra request. A failed marker write is retried once. If it still fails, an
automatic or agent title is saved anyway (the heuristic covers it), but a `user` rename fails
without writing the title, so a hand rename is never left unprotected after a reload (the title and
the marker cannot share one request: `topic.updateTopic` does not accept metadata).
The in-memory `#topicTitleOrigins` map mirrors it for topics outside the loaded lists.

`summaryTopicTitle` (run-completion and lifecycle summarise) returns before any write or model call
when the in-memory source or the stored marker is `user` or `agent`; only the explicit "auto rename"
menu action passes `force`. The dev slice path goes through `applyAutoTopicTitle`, which follows the
same rule.

On load the marker is read back from `topic.metadata.titleSource`. Topics titled before this change
have none; for those `canAgentRetitleTopic` keeps a heuristic: only an empty title, the
loading/default placeholder, or the slice of the first user message may be replaced, anything else
is treated as user-set.

## Title linger

`claude-agent-acp` generates its first title in the background about two seconds after the turn
ends (verified in its `src/session-titles.ts`: `onTurnEnd` publishes a stored `customTitle`
immediately, otherwise starts a \~2s generation, at most once per session). Orvilo runs one bridge
process per turn, so the process now lingers briefly (`AcpAgentSession`):

- **When:** the prompt ended with `stopReason: 'end_turn'`, `onSessionTitle` is set, no title has
  been delivered for this session yet, and no cache keep-alive is armed (a keep-alive already keeps
  the process alive).
- **How long:** until the first title or `SESSION_TITLE_LINGER_MS` (5000 ms), then the child closes
  as before. The timer is `unref`'d and cleared on every exit path; the child is closed even if the
  title callback throws.
- **Never delays the UI:** the linger is a timer inside the `run()` `finally`, not an `await`, so
  `run()` resolves, the result/terminal events are flushed, and `heteroAgentSessionComplete` is
  broadcast first. The renderer marks the run finished and calls `stopSession` while the child is
  still alive.
- **Inert while lingering:** in the base class, every `session/update` except the title is ignored
  (not pushed to the pipeline, nothing emitted), every reverse request is refused (permission and
  elicitation cancelled, anything else answered with an error), and no prompt is sent. Subclasses
  cannot forget this: the gate wraps `handleAgentMessage` / `handleServerRequest`.
- **End signal:** `onTitleWindowEnd` fires once when the window is over (title delivered, cap, forced
  close, keep-alive disarm, or a turn with nothing to wait for). Main forwards it as
  `heteroAgentSessionTitleEnd` and forgets the session.
- **Renderer:** the title-only listener (`sessionTitleWatcher.ts`) is separate from the run's
  stream subscription. The run's `finally` keeps it alive until the end signal, with a safety
  timeout (7 s, above the 5 s cap) so it cannot leak. A late title goes to the run's topic through
  `applyAgentTopicTitle`, which respects the user/agent markers and drops a topic that no longer
  exists.

### Graceful vs forced stop

`release()` joins a pending linger and is used only by the renderer's post-run `stopSession`.
`close()` and `interrupt()` kill at once. Because the run's session reference is cleared when
`run()` settles, main tracks a lingering session by IPC session id (`lingeringAcpSessions`) and
removes it from the session's own `onTitleWindowEnd`.

| Caller                                                                                               | Mode                                                       |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| renderer `heterogeneousAgentExecutor` `finally` -> `stopSession`                                     | graceful (`release()`; a no-op for a lingering session)    |
| renderer user cancel -> `cancelSession`                                                              | forced (also closes a lingering session of that id)        |
| main `before-quit` handler (also reached by `window-all-closed` and SIGTERM/SIGINT via `app.quit()`) | forced, including lingering sessions                       |
| main SIGTERM / SIGINT handler                                                                        | forced for lingering sessions directly, then the quit flow |
| a new `sendPrompt` whose session has the same native `agentSessionId`                                | forced for the lingering one                               |

There is no other stop/close-all path in the desktop main process (no sign-out, workspace switch or
device-unregister caller of these sessions exists; they were searched for).

## Threat model: the title is untrusted text

The title is produced by an external agent that may have been steered by untrusted repository or
web content, is stored as the topic title, shown in the UI, and can reach other agents' context.

Mitigation in `parseAcpSessionTitle`: single line (tab / newline / CR become one space), then every
invisible character is **removed** (not replaced by a space): all of Unicode `\p{C}` (controls,
format characters such as zero-width, bidi and tag characters, lone surrogates, private use,
unassigned), `\p{Zl}`, `\p{Zp}`, plus U+034F, the Hangul fillers (U+115F, U+1160, U+3164, U+FFA0),
U+180B-U+180F and the blank Braille pattern U+2800. Whitespace runs are collapsed, the result is
trimmed, capped at 100 code points (no split surrogate pair), and rejected (the slice title stays)
unless it contains a letter, number, punctuation mark or symbol.

Emoji: variation selectors (U+FE0F) are kept. A ZWJ is kept only between two pictographs, so a
family emoji survives while a hidden joiner in text is removed. Tag-sequence flags (England,
Scotland) lose their tag characters and show as a plain black flag.

The title stays a plain string. Sidebar rows render it as a React text child (no
`dangerouslySetInnerHTML` outside the SVG artifact and analytics snippets), so markup in a title is
shown literally.

A sanitised title is still not safe to splice into a prompt. Client-side places where a topic title
reaches model context, all now escaped with `escapeXml` (`& < > " '`) from `@orvilo/prompts`, and
`parseReferTopicTags` unescapes the name it reads back (`unescapeXml`):

| Place                                                                                                                            | Delimited as data?               |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `src/store/chat/slices/agentRun/actions/entries/conversationLifecycle.ts` `<refer_topic name=...>` in the user message           | Yes (escaped attribute)          |
| `src/features/ChatInput/InputEditor/index.tsx` and `ReferTopic/ReferTopicPlugin.ts`, same tag                                    | Yes (escaped attribute)          |
| `packages/context-engine/src/providers/TopicReferenceContextInjector.ts` `title=...` in `<referred_topics>` / `<pending_topics>` | Yes (escaped attribute)          |
| `packages/memory-user-memory/src/providers/chatTopic.ts` `x('topic_title', ...)`                                                 | Yes (`xast-util-to-xml` escapes) |

Server prompts were not reviewed. Escaping stops a title from leaving its attribute; the text of a
title is still read by the model as data inside that attribute.

## Verification by reading source

- Verified by reading source: `claude-agent-acp` (`src/session-titles.ts`): publishes
  `session_info_update` at turn end, republishes a stored title on resumed turns, generates one
  title per session in the background, falls back to the raw first prompt.
- Expected from the ACP spec only (not read): `codex-acp` mapping `thread/name/updated` to
  `session_info_update`, and the other bridges (TRAE, Droid, Devin, Cursor, Grok). The parser is
  protocol-level, so they work if they follow the spec.

The one-shot `spawnAgent` / `orvilo hetero exec` path passes no `onSessionTitle` and so neither lingers nor
receives titles; delivering them there would need a new field on `aiAgent.heteroIngest` (server change).
