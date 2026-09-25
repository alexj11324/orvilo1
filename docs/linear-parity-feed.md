# Linear parity — issue feed, reactions and subscribers

Closes the remaining main-column findings of the feed audit (`issue-list.md`
M3 / M7 / M9) on the issue detail page.

## Add reaction (M3)

`TaskReactions` under the instruction renders Linear's description footer:
reaction chips plus the muted **Add reaction** link (quick-emoji grid with a
full `@emoji-mart/react` picker — the same pattern as message reactions).

Reactions persist client-side in `src/store/taskReactions.ts` (a persisted
zustand store keyed by the task's database id). There is no `task_reactions`
table yet; the store is the deliberate local stand-in so the UI behaves like
the real feature. When the backend lands, swap the store for endpoints — the
component contract (`reactions` / `addReaction` / `removeReaction`) is already
the shape an API would return.

## Attach row (M3)

The lone paperclip icon under the instruction is now Linear's muted
**Attach images, files, or videos** text link. It calls the same
`pickAndInsertAttachments` path the old icon did — files still land in the
editor's attachment registry and save with the instruction.

## Subscribers (M7)

`TaskSubscribers` sits under the comment composer: **Subscribe** /
**Unsubscribe** for oneself, the subscriber avatar stack, and a
**Change subscribers** popover listing workspace members with checkmarks —
any member may manage anyone's subscription, like Linear.

Backend: `TaskSubscriptionModel` gained `listByTask`, `subscribeForUser` and
`unsubscribeForUser` (the bound `subscribe`/`unsubscribe` now delegate). Two
new `workAttention` endpoints serve the row:

- `subscribers` — active subscriber ids for a task.
- `setSubscriber` — toggle anyone's row. Managing somebody else's subscription
  requires a workspace context and an active membership row for the target;
  toggling oneself works everywhere.

## Relation activity events (M9)

`TaskActivityLogType` gained `relation`. `addDependency` and
`removeDependency` now write a denormalized feed row on **both** issues —
"marked this issue as blocked by T-3" on the dependent and "marked this issue
as blocking T-4" on the blocker — matching Linear's two-sided history. The
payload carries `relationAction`, `relationDirection` (`blockedBy`/`blocking`,
absent for symmetric `relates` edges), `relationKind`, and the target's
identifier + id so the sentence stays readable after the other issue is
renamed or deleted.

Attribution goes through a new optional `actor` field on
`TaskMutationContext`; the agent tool runtime passes the acting agent so feed
rows credit it rather than the task owner. The service maps the rows onto the
existing `property` activity type (`propertyChange.field: 'relation'`), and
`TaskActivities` renders them with the link/ban marks and translated
sentences.
