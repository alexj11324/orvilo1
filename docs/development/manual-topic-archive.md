# Manual topic archive vs. completed status

Two separate statuses carry "this conversation is no longer running" signals:

| Status      | Writer                                                                     | Feed behavior                              |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| `completed` | `markTopicEnded` / `markTopicCompleted` (a run finished, user-marked done) | **stays listed** — lifecycle metadata only |
| `archived`  | `archiveTopic` (the user's explicit hide)                                  | **leaves the feed**                        |

Completion is observational: `markTopicEnded` still writes `status='completed'`
unchanged — it is meaningful metadata (the status dot can show a finished run).
It is NOT an implicit archive. Before this split, the sidebar feed's
`excludeStatuses: ['completed']` made finished conversations vanish on their
own; the owner decision is that only an explicit archive removes a row.

## The exclusion lives in two places

- `useChatTopicListQuery` (`src/hooks/useFetchChatTopics.ts`) passes
  `excludeStatuses: EXCLUDE_STATUSES_ARCHIVED = ['archived']` to the list fetch —
  the workspace feed hook and every caller of `useFetchChatTopics` share it.
- `currentTopicsWithoutSystemTriggers` (`src/store/chat/slices/topic/selectors.ts`)
  repeats the `status !== 'archived'` filter client-side, belt-and-braces against
  a looser fetch overwriting the container-keyed `topicDataMap` bucket.

Both surfaces therefore behave identically on desktop, group sidebar, and the
mobile feed (`MOBILE_TOPIC_STATUSES` in
`src/features/MobileHome/TopicListContent/mobileTopicRows.ts` already ships
every status except `archived`).

The old `includeCompleted` filter toggle + `topicIncludeCompleted` preference
selector are gone — completed rows can no longer be filtered out; the persisted
`topicIncludeCompleted` field stays in the user-preference schema for stored
state compatibility but reads nowhere.

## Actions

`archiveTopic(id)` / `unarchiveTopic(id)` are thin `updateTopicStatus` wrappers
in `src/store/chat/slices/topic/action.ts`:

- `archiveTopic` persists `{ status: 'archived' }` — a distinct column value,
  not `completed`, so finished runs are never swept into the archived set.
- `unarchiveTopic` restores `{ status: 'active' }`.
- Both reuse the pending-write pin + `internal_dispatchTopic` optimistic path.
  `updateTopicStatus`/`internal_pinTopicStatus` resolve the write's bucket via
  `getTopicContainerKeyById` — the workspace feed holds the sidebar's rows, not
  the agent bucket the scope params would derive.

## UI affordances

- Hover archive icon on the topic row (`Actions.tsx`, agent + group sidebars) —
  the Codex-style affordance. Click → archive → row leaves the feed. For an
  archived row it becomes unarchive (`ArchiveRestore`).
- The same action is the first item of the row's ⋯/context menus
  (`actions.archive` / `actions.unarchive`).
- The sidebar-header "archive merged PRs" bulk action now writes `archived`
  (it previously wrote `completed` to get rows out of the feed).

## The way back

There is no dedicated archived view yet: an archived row is reachable via the
topic search (`searchTopics`/`queryByKeyword` carries no status filter) or a
direct link, where the row's own menu offers Unarchive. Opening one keeps it
visible in the sidebar via the active-topic injection in
`displayTopicsForSidebar`. If a real archived view becomes a requirement, it is
a follow-up — the PR deliberately keeps scope to "remove from feed + way back
exists".
