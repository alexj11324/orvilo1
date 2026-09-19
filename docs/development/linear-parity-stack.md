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

