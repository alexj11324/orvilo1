# Issue attachments "Task not found" and the Inbox deleted-target pane

## Attachments block: "加载失败 / Task not found"

The section calls `taskMenu.links`, which resolves the Issue through `TaskModel.resolve`
(`packages/database/src/models/task.ts`). `resolve` treats only `task_`-prefixed strings as
database ids; anything else is uppercased and looked up as an identifier. The client sent
`detail.id`, and the seeded rows have ids of another shape (`taskparitymine0002` for PMI-2,
`taskpv0036` for PARITY-8), so the lookup missed and `TaskResourceModel.resolve` threw
`Task not found`. Sibling sections load because they ride the detail payload, which was fetched by
identifier.

Client change: `issueResourceRef` addresses links/PRs by the public identifier (always resolvable),
falling back to the database id; the section, the header menu's list/remove/add all use it so they
share one SWR key. Backend follow-up (not changed here): `TaskModel.resolve` should fall back to
`findById` when the identifier lookup misses, so non-`task_` ids resolve.

## Inbox "加载失败 / 未找到该页面或资源" on a task-linked item

`task.detail` throws tRPC `NOT_FOUND` for a missing/deleted Issue, but `useActiveTaskDetail` only
treated the store tag `TASK_NOT_FOUND` as "gone"; the tRPC error therefore rendered as a transient
load failure (404 copy + a Retry that cannot succeed). `isTaskNotFound` now accepts both shapes.

`IssueContent` takes an optional `notFound` slot. The Inbox pane passes a calm "This Issue was
deleted" state under the notification's own title/text, with a dismiss action when the card offers
one. Other hosts keep the default Issue-not-found page.
