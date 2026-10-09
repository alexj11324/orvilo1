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
  -> heterogeneousAgentExecutor onSessionTitle -> chat store applyAgentTopicTitle
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
titling costs no extra request. A failed marker write is logged and the title is still saved.
The in-memory `#topicTitleOrigins` map mirrors it for topics outside the loaded lists.

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
- **How long:** until the first title arrives or `SESSION_TITLE_LINGER_MS` (5000 ms), then the
  child closes exactly as before. The timer is `unref`'d and cleared on every exit path; the child
  is closed even if the title callback throws.
- **Never delays the UI:** the linger is a timer inside the `run()` `finally`, not an `await`, so
  `run()` resolves, the result/terminal events are flushed, and `heteroAgentSessionComplete` is
  broadcast first; the renderer marks the run finished and calls `stopSession` while the child is
  still alive.
- **Graceful vs forced:** `release()` (used by main `stopSession`) joins a pending linger, never
  cuts it short or restarts it. `close()` is forced and kills at once; it is used by cancel /
  `interrupt()`, the `before-quit` handler, and a new `sendPrompt` for the same native agent
  session (`HeterogeneousAgentImpl.closeLingeringAcpSessions`, which tracks sessions that
  `stopSession` already dropped from its map).
- Failed, cancelled or aborted turns, and turns whose title already arrived, close immediately.

## Threat model: the title is untrusted text

The title is produced by an external agent that may have been steered by untrusted repository or
web content, is stored as the topic title, shown in the UI, and can reach other agents' context.

Mitigation in `parseAcpSessionTitle`: single line (all whitespace collapsed), C0/C1 controls,
zero-width characters (U+200B-U+200D, U+2060, U+FEFF), bidi embedding/override/isolate characters
(U+202A-U+202E, U+2066-U+2069) and lone surrogates removed before trimming and measuring, capped at
100 code points without splitting a surrogate pair, and rejected (the slice title stays) when
nothing printable remains. It stays a plain string. Sidebar rows render the title as a React text
child (no `dangerouslySetInnerHTML` outside the SVG artifact and analytics snippets), so markup in
a title is shown literally.

What the parser cannot do is make a title safe to splice into a prompt. Client-side places where a
topic title reaches model context:

| Place                                                                                                                                                                                                                                      | Delimited as data?                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `src/store/chat/slices/agentRun/actions/entries/conversationLifecycle.ts:516-518` builds `<refer_topic name="${topicTitle}" .../>` into the user message                                                                                   | No: raw interpolation into an attribute, `"` and `/>` are not escaped |
| `src/features/ChatInput/InputEditor/index.tsx:449` and `ReferTopic/ReferTopicPlugin.ts:66` serialise the same tag from the title                                                                                                           | No: same raw interpolation                                            |
| `packages/context-engine/src/providers/TopicReferenceContextInjector.ts:60,76` writes `title="${item.topicTitle}"` into `<referred_topics>` / `<pending_topics>` (title comes from `resolveTopicReferences.ts:89`, the live `topic.title`) | No: raw attribute, not escaped                                        |
| `packages/memory-user-memory/src/providers/chatTopic.ts:98` `x('topic_title', title)`                                                                                                                                                      | Yes: built with `xast-util-to-xml`, which escapes                     |

The first three are reported, not changed here: the title can carry a `"` followed by arbitrary
attribute-looking text. Escaping `&`, `<`, `>` and `"` where the tag is built is the follow-up.
Server prompts were not reviewed.

## Verification by reading source

- Verified by reading source: `claude-agent-acp` (`src/session-titles.ts`): publishes
  `session_info_update` at turn end, republishes a stored title on resumed turns, generates one
  title per session in the background, falls back to the raw first prompt.
- Expected from the ACP spec only (not read): `codex-acp` mapping `thread/name/updated` to
  `session_info_update`, and the other bridges (TRAE, Droid, Devin, Cursor, Grok). The parser is
  protocol-level, so they work if they follow the spec.

The one-shot `spawnAgent` / `orvilo hetero exec` path passes no `onSessionTitle` and so neither lingers nor
receives titles; delivering them there would need a new field on `aiAgent.heteroIngest` (server change).
