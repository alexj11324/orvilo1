# Conversation handoffs: Continue and Fork

A topic's agent is an **execution assignment**, not a container. Under the
conversation-first contract, conversations own their identity — id, message
history, and position in the workspace feed — while the agent is weak metadata
describing who executes next.

## The two handoff modes

Picking a different agent in the composer selector while a topic is open
offers two explicit choices behind a light confirmation:

- **Continue with {agent}** — `rebindTopicAgent(topicId, toAgentId)` reassigns
  the conversation's execution agent. Only `topics.agent_id` (and its resolved
  `session_id`) flips via `updateTopic`; the topic keeps its id, its message
  list, and its feed position. Messages and threads are **never** re-parented:
  each message row keeps the `agent_id` of the agent that produced it, which
  is what makes earlier execution segments visible in one stable conversation.
  A boundary is recorded in `metadata.agentHandoffs` (`{ at, fromAgentId,
toAgentId }`), rendered in the timeline by `AgentHandoffMarker`.

- **Fork to {agent}** — `forkTopicAgent(topicId, toAgentId)` creates a **new**
  topic seeded from this conversation's context/history, bound to the target
  agent (`cloneTopic` with `targetAgentId` — the duplicate detaches from the
  source agent's session while copied messages keep their producing-agent
  stamps). The original conversation is untouched.

`batchMoveTopics` (the message/thread-reparenting move) is scoped to its only
remaining real caller: the explicit bulk **Move to agent** dialog
(`MoveTopicsModal` → `batchMoveTopicsToAgent`).

## Drafts belong to the conversation

An existing topic's composer draft keys on `topicDraftKey(topicId)`
(`topic_<topicId>` in localStorage), not the agent bucket — a mid-topic
Continue can never strand typed text under the previous agent's key. The
sidebar's `[Draft]` hint derives the same key.

The blank/new-topic composer keys on the workspace (`topic_new`), so an
agent pick on it keeps the typed text too. `carryDraftToKey` is gone:
no flow moves drafts between keys anymore. See
[conversation-routing.md](./conversation-routing.md) for the URL contract
that makes these keys stable.

## Write points

Both Continue and Fork are explicit user agent picks, so each writes
`lastUsedAgentId` — matching the update-point contract in
[last-used-agent-default.md](./last-used-agent-default.md).

## Server rules for Continue

`topic.updateTopic` is the write behind Continue. When its input carries an
`agentId`:

- The row's `agent_id` is set to that Agent. Its `session_id` follows: the
  Agent's legacy session when it has one, otherwise `null`, so the previous
  Agent's session never stays on the row.
- The move counts as a transfer. In a workspace, only the topic's creator or a
  workspace owner may do it, the same rule as `batchMoveTopics`. Other members
  can still co-edit the title, status and metadata.
- The target Agent must be reachable by the caller. The `use` guard skips ids
  outside the caller's scope, so the route also confirms the Agent exists in
  that scope and answers `NOT_FOUND` otherwise.

The integration tests in
`apps/server/src/routers/lambda/__tests__/integration/topic.integration.test.ts`
cover the flip, the cleared session and the rejected foreign Agent.
