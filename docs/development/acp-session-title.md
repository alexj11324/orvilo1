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
  sends many) are ignored. The title is trimmed, whitespace-flattened, capped at 200 characters
  and kept as plain text.
- It is called once, in the shared `AcpAgentSession` base, so every ACP runtime (standard
  bridges, TRAE, Droid, Devin, Cursor, Grok) behaves the same. Replayed history (before the
  prompt starts, or `_meta.isReplay`) and repeats of the same title are ignored.
- It is a side channel, not a stream event. The event stream is also ingested by the server
  (`aiAgent.heteroIngest`, whose `AgentStreamEventSchema.type` is a closed `z.enum`, and the
  CLI `orvilo hetero exec` path): an unknown `session_info` type would fail the whole batch.
  The title therefore never enters `onEvents`. The one-shot `spawnAgent` CLI path passes no
  `onSessionTitle`, so titles are dropped there.

## Title source marker

`ChatTopicMetadata.titleSource` (`'user' | 'agent' | 'auto'`) is typed but **not persisted**:
`chatTopicMetadataUpdateSchema` in `packages/types/src/topic/topic.ts` is a plain `z.object`, so
`topic.updateTopicMetadata` strips the key. Until it lists the key, the client keeps the source
in memory (`#topicTitleOrigins` in the topic slice). After a reload, `canAgentRetitleTopic` falls
back to a heuristic: only an empty title, the loading/default placeholder, or the slice of the
first user message may be replaced; anything else is treated as user-set. That also protects an
earlier agent title after a reload.

Needs a backend change to persist the marker: add
`titleSource: z.enum(['user', 'agent', 'auto']).optional()` to `chatTopicMetadataUpdateSchema`
(`packages/types/src/topic/topic.ts`), then write it from `updateTopicTitle` /
`applyAgentTopicTitle` through `updateTopicMetadata`. The client already reads a persisted value.

## Known gap: titles that arrive after the process is gone

`claude-agent-acp` generates its title in the background about two seconds after the turn ends.
Orvilo runs one bridge process per turn and closes it as soon as `session/prompt` resolves:

- `AcpAgentSession.run()` `finally` closes the client unless the cache keep-alive armed.
- The renderer's `heterogeneousAgentExecutor` `finally` calls `stopSession`, and the main
  process `stopSession` calls `close()` on the ACP session, which also disposes an armed
  keep-alive.
- `emitEvents` drops events while keep-alive is armed (the side channel does not depend on it).

So a title is delivered when the bridge reports it while the process is alive: during the turn,
on later turns of a resumed session (the bridge republishes the stored title at turn end), and
while a keep-alive holds the process. A first-turn title generated after the response is lost
for one-shot runs; those topics keep the first-message slice. Delivering it needs a product
decision: a bounded post-turn linger of the bridge process (touching the three close sites above
and the renderer's `stopSession`), or accepting slice titles for first turns.
