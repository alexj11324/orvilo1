# Linear-parity navigation stack

The Linear-aligned navigation/work-surface rebuild ships as four ordered
PRs (stack). Each layer only sees the diff for its own concern; a layer may
only merge after the ones below it.

| #   | Layer                     | Contents                                                                                                                                                                                                                                    |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Data + contract (this PR) | `packages/database` workspace-scope semantics (`buildWorkspaceWhere` union / `buildStrictWorkspaceWhere`), `workAttention`/`pullRequest`/`savedView`/`team` routers, migration `0176_work_attention`, client services under `src/services/` |
| 2   | Workspace activation      | URL→store sync (`useWorkspaceUrlSync`), `workspaceContextStore`, `X-Workspace-Id` header, default-workspace provisioning (no personal scope)                                                                                                |
| 3   | Work surfaces             | Inbox, My issues, Reviews, Views, Teams, Members, unified KanbanBoard, route registration                                                                                                                                                   |
| 4   | Sidebar IA + locales      | Fixed Linear entry order, quick-create, workspace switcher, team sub-nav, retired legacy groups, locale keys, frozen spec packets                                                                                                           |

## Layer 1 — data contract

- Workspace scope reads as a union: workspace rows OR the caller's own
  unfiled rows (`workspace_id IS NULL AND user_id = me`) so existing
  personal data follows its owner into the workspace.
- Per-scope namespaces stay strict (`buildStrictWorkspaceWhere`): quota
  provider accounts, eval identifiers, builtin agent slugs, connector
  credentials, acceptance subject aggregates, scoped export.

## Layer 2 — workspace activation

- `useWorkspaceUrlSync` is the only writer of the active workspace: a
  `/{slug}` path activates that workspace and persists it as the last-used
  target; slug-less paths reactivate the last-used (or first) workspace;
  an empty membership list provisions the default via
  `workspace.ensureDefault`. There is no personal scope.
- `workspaceContextStore` feeds the `X-Workspace-Id` lambda header and SWR
  cache scoping; silent switches reconcile the store without navigating.

## Layer 3 — work surfaces

- One `KanbanBoard` (Cordy port) serves every board surface; hidden columns
  render as inline rails and empty boards still render all columns.
- Inbox pagination, URL-driven selection, saved views with a visual filter
  builder, team sub-navigation, the members directory, and the PR review
  workspace live here; routes register under both bare paths and
  `/{workspaceSlug}` mirrors.

## v6 — data/query repairs (wave-2 repair package)

- Saved-view filter round-trip preserves the boolean tree: `filter.any`
  round-trips verbatim, `filter.all` keeps a positional slot blueprint so
  non-renderable nodes survive edits, and a pure rename never recompiles
  the AST. The router input schema tries the predicate shape before the
  all-optional filter object (`strictObject`) so predicates are not
  key-stripped to `{}` on save.
- Board layout honors the saved sort via explicit
  `sortMode: manual | field`; layout, grouping, and sort are independent
  dimensions.
- Project/cycle pickers call `projectOptions`/`cycleOptions` — authorized
  server-side search, keyset pagination, `ids` hydration for selected
  values; cycle options are scoped to the team pinned by a `teamId`
  filter row instead of fanning out per team.
- My issues "Activity" filters on real notification episodes
  (`notifications` rows keyed by `resourceType='task'`) ordered by
  `lastActivityAt`/`createdAt`; "Created" sorts by `createdAt`.

## v6 visual layer — work-surface frame contract

- `src/features/WorkSurface/` defines four skeletons sharing one root
  (`container-name: work-surface`, `container-type: inline-size`):
  `WorkSurfaceCollection` (header + toolbar + sticky column-header slot +
  scroll host + 16px-gutter body at full surface width), `WorkSurfaceSplit`
  (360px list pane `max-width: 45%` + `flex: 1` detail; detail absent ⇒ list
  owns the width — no dead columns), `WorkSurfaceDocument` (centered
  `min(960px, 100%)` reading column), `WorkSurfaceReview` (280px file-nav +
  content scroll host + pinned footer; REVIEW owner fills internals).
- `WorkSurfaceToolbar` is a single `nowrap` row; `aside` controls collapse
  into a click-triggered `Popover` under `@container work-surface
(max-width: 560px)` — preludes must be literal (stylelint rejects
  interpolations in `@container` preludes), the token constants stay the
  source of truth for the values.
- Collection and document pages stop consuming `WideScreenContainer` (its
  `min(960px, 100%)` centered column follows the chat `wideScreen` toggle —
  correct for chat, wrong for collections). `Projects`, `Teams`, `Members`
  mount `WorkSurfaceCollection`; `TaskDetailPage` mounts
  `WorkSurfaceDocument`. `WideScreenContainer` semantics are unchanged;
  remaining consumers migrate next wave or stay chat-scoped.
- Members is the applied collection template: one `LiteTable` directory
  (`Name | Status | Joined | Teams | Last seen | row menu`) shared by
  people / agents / invitations; agents are labeled agents, not
  applications; contract-absent fields render `—` rather than borrowing a
  neighbour's meaning.
- `IssueContent` (`AgentTaskDetail/IssueContent.tsx`) carries the issue
  properties/body/activity/comments sections; `TaskDetailPage` delegates to
  it and the Inbox owner mounts it inside `WorkSurfaceSplit` next wave.

## v6 wave 2 — inbox recovery

- `WorkInbox` mounts `WorkSurfaceSplit`: a `splitList` feed + a `splitDetail`
  pane that renders the notification header/actions above the lazy
  `IssueContent` — no embedded `TaskDetailPage`, one scroll owner per pane.
  Ordinary (non-action) notifications render no approval buttons.
- `InboxFeedPager` (`WorkInbox/inboxFeedPager.ts`) owns the tail of the
  keyset-paged feed; page 1 stays in SWR. Commit tokens bind each in-flight
  page fetch to `user + workspace + kind/filter fingerprint + generation`,
  so a late response that resolves after a scope change is dropped instead
  of landing in the new list. `removeCard`/`updateCard` patch the tail in
  place (and blacklist racing resurrections) so organizing one card updates
  later pages immediately. Reusable by other keyset-paged lists.
- `notification.feedCard` is the authorized by-id read for deep links:
  `?item=<id>` resolves the selected card even when it lives on an unloaded
  page, and `?detail=1` restores the open detail on mobile.
- Reply drafts persist under
  `orvilo:inbox-draft:{user}:{workspace}:{requestId}:{generation}` — bound
  to the request's `executionGeneration`/`sourceRevision`, never the
  notification `activityVersion`.
- Decision idempotency persists under
  `orvilo:inbox-decision:{user}:{workspace}:{requestId}:{decision}`: one
  intent is `{requestId + sourceRevision + executionGeneration + decision +
inputDigest}` → one `operationId`. After an unknown result the next attempt
  reconciles via `feedCard` before resending — identical retries reuse the
  operation, edited input mints a new one.
