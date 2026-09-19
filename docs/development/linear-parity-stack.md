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
