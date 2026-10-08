# Issue navigation and retired creation shortcuts

Ported from `codex/issue-ui-corrections` commit `452affd58` (approved Issue UI corrections, PLAN items 1 and 2), with the matching type and regression follow-ups from `fec33c076` and `d07cfc643`.

## Navigation contract

The primary sidebar order is fixed by `src/features/Navigation/sidebarContract.ts` and `DEFAULT_SIDEBAR_ITEMS` in `src/store/global/selectors/systemStatus.ts`:

```plaintext
Issues · Inbox · My issues · Agent · Groups · Drafts · Workspace · Favorites · Teams
```

- **Issues** (`tasks`, `tab.issues`, `/tasks`) is the single Issues destination. The root route already lands on the Issues board, so there is no separate Home row. The Agent and Group secondary sidebars carry the same Issues row instead of Home.
- **Reviews** and the **create** row are legacy keys. A stored or workspace-synced preference cannot bring them back, the Customize sidebar dialog does not list them, and a restored Electron tab that points at `/reviews` is dropped. The `/reviews` route and the pull request backend stay reachable by direct link.
- The sidebar no longer fetches the pending review count, because nothing renders it.

## Creation belongs to the owning page

The sidebar and its header expose no creation control.

| Removed entry point                                                   | Where creation lives now                   |
| --------------------------------------------------------------------- | ------------------------------------------ |
| Header new-issue icon, sidebar `+` row                                | Issues board (page-owned Create Issue)     |
| Sidebar Agent create button and Agent/Group/category create menus     | Agents page                                |
| Agent sidebar New topic row and per-project new-topic actions         | Command palette "new conversation"         |
| Desktop File menu New Agent / New Group items (macOS, Windows, Linux) | Agents page and Groups page                |
| Command palette new Agent / group chat / goal, slash-menu goal action | Owning pages                               |
| Settings → Agents "New Agent" button                                  | Agents page                                |
| Resource sidebar new-library and new-folder shortcuts                 | Library page                               |
| Chat input "create Agent" entries                                     | Select an existing Agent; create in Agents |

The Create Issue hotkey still works: it navigates to `/tasks` first and then opens the same page-owned modal.

`/group` with no groups keeps one action, **New group chat**, which opens the existing group chat modal directly. The "generate from a description" shortcut went away together with the builder-driven `sendAsGroup` store action.

## Goals

Application-owned goal creation is hidden from every UI entry point: the create row, the command palette, the inline Issue composer's "switch to goal" action, the Goals page header and empty state, and the slash-action menu. Native ACP goal capabilities, the goal services and persisted goal records are untouched; the Goals page still lists records and its empty state says that goals created by an Agent appear there.

## Hotkeys

`g r` (go to Reviews) is no longer registered or handled. The `GoToReviews` enum member stays so stored user hotkey settings keep parsing.

## Regression coverage

- `src/store/global/selectors/systemStatus.test.ts`, `src/hooks/useNavLayout.test.tsx`, `src/features/HomeSidebar/Body/index.test.tsx`, `src/features/HomeSidebar/Body/CustomizeSidebarModal.test.ts`: persisted `create` / `reviews` / `home` keys cannot resurface, and Issues is present.
- `packages/const/src/hotkeys.test.ts`, `src/hooks/useHotkeys/globalScope.test.ts`, `src/hooks/useHotkeys/goToNavigation.test.ts`: no Reviews chord; Create Issue goes to the board.
- `apps/desktop/src/main/menus/impls/*.test.ts`: no creation items in the File menu on any platform.
- `src/features/Electron/titlebar/TabBar/storage.test.ts`: restored Reviews tabs are removed and the pruned list is saved.
- `e2e/src/steps/agent/conversation-mgmt.steps.ts`: the new-conversation journey goes through the command palette.
