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

## v6 wave 2 — collection-skeleton adoption (pages)

- `MyWorkPage`, `TeamPage`, `SavedViewsPage` and `SavedViewPage` mount
  `WorkSurfaceCollection`: the page toolbar lives in `WorkSurfaceToolbar`
  (tabs/scope stay primary; filters, the list/board switch, and secondary
  actions ride `aside` and collapse into the popover under 560px surface
  width). Pages that own a kanban bound the collection body to the
  scrollport (`height: 100%` + column flex) only while board layout is
  active, so column-internal scrollers engage and the list/board toggle
  never changes shell width.
- `/views` is a directory table (`LiteTable`): `Name | Layout | Sharing |
Updated | row menu`, grouped Built-in / Mine / Shared with counts. Rows
  click through to the editor, but the name cell keeps a real anchor so
  open-in-new-tab still works; the row menu sits in a click-isolated cell
  to stay out of the row's click-to-open path.
- Project routes (`/project/*`) no longer swap the workspace nav panel:
  `resolveNavPanelKey` maps them to `home`, and `Projects/Layout` renders
  the project section nav (home/tasks/resources/goals + project switcher +
  favorite) as a fixed 208px in-page rail. The rail reuses `SideBarLayout`
  with an explicit `scrollKey="project"` so its scroll memory never
  collides with the workspace panel's (both would otherwise bucket under
  `home`).
