# Workspace conversation feed

The sidebar outside a group session is **conversation-first**: one workspace-wide
feed of every non-group topic the caller can see, ordered by activity. The agent a
topic belongs to is weak row metadata (status dot + display name on a secondary
line), never part of the navigation hierarchy.

## Data path

```
useWorkspaceConversationFeed()            src/hooks/useFetchChatTopics.ts
  └─ useFetchTopics(enabled, { scope: 'workspace', pageSize, ...query })
       → topicDataMap['workspace']        (WORKSPACE_TOPIC_MAP_KEY)
       → topicService.getTopics({ scope: 'workspace', ... })
       → tRPC topic.getTopics { scope }
       → topicModel.query({ scope: 'workspace' })
```

- `topicMapKey({ scope: 'workspace' })` returns `WORKSPACE_TOPIC_MAP_KEY`
  (`'workspace'`) regardless of `agentId`/`groupId`. The scope is explicit-only:
  `topicMapKey` never infers it from empty container ids.
- `selectors.currentTopicData` resolves the workspace bucket whenever
  `activeGroupId` is unset, so every `current*`/`display*`/`grouped*`/`hasMore*`
  selector reads the feed unchanged. Group sessions still read
  `topicMapKey({ agentId, groupId })`.
- `topicModel.query(scope: 'workspace')` lists every non-group topic
  (`topics.groupId IS NULL`) whose owning agent is visible to the caller
  (`or(topics.agentId IS NULL, buildWorkspaceWhere(scope, agents))`), with the
  same slim projection and activity ordering as the agent list. Group topics are
  excluded because group conversations carry no per-row agent metadata — group
  routing in the feed is deferred to the routing PR.
- `topic.searchTopics` accepts the same `scope: 'workspace'`; the model matches
  it via an `exists` subquery so the keyword queries stay join-free.

## Write-path mirroring

Agent-scoped writes must also reach the feed or the sidebar goes stale until the
next SWR revalidation:

- `internal_dispatchTopic` mirrors every non-group write into the workspace
  bucket when it exists (`addTopic` additionally requires `!value.groupId`;
  `updateTopic`/`deleteTopic`/`replaceTopicId` are inherently no-ops on rows the
  feed doesn't hold). Membership revisions are bumped for both keys so an
  in-flight list fetch can't resurrect a deleted row.
- `internal_updateTopics` (the post-send list write) merges the returned agent
  page into the workspace bucket — upsert + prepend unseen rows — instead of
  replacing it, which would drop other agents' rows.
- `refreshTopic` and `#writeThroughTopicListCache` match both the owning bucket
  and `WORKSPACE_TOPIC_MAP_KEY` so revalidation and the persisted cache tier
  cover the feed.
- `#getTopicFilter` (sendMessage's `topicFilter`) reads the workspace bucket's
  filters outside a group session.

## Row binding

`TopicItem` resolves `rowAgentId = topic.agentId ?? activeAgentId` — a feed row
can belong to a different agent than the room route, so message prefetch, draft
lookup, runtime status, elapsed time and double-click tab restore all bind the
row's owning agent. `navigateToTopic` pushes
`AGENT_CHAT_TOPIC_URL(ownerAgentId, topicId)` when the owner differs from the
route agent (deep link, not `switchTopic`, to avoid an A-route/B-topic flash).

## Deferred

- **Cursor pagination** — the feed is bounded by `topicPageSize` (default 20)
  with the existing load-more pager; cursor pagination lands in a follow-up PR.
- **Group topics in the feed** — needs group routing + per-row group metadata.
- **Model/provider on rows** — intentionally absent; agent name is the only
  weak secondary line, shown only when the owner differs from the route agent.
