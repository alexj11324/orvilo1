# Sidebar Issues entry

The primary sidebar now carries a top-level **Issues** row that opens the workspace-wide issue list at `/tasks`. It sits directly after **My issues**:

```plaintext
Inbox · My issues · Issues · Reviews · Agent · Groups · [+ create] · Workspace · Favorites · Teams
```

Research of the Multica and Plane sidebars showed both keep a workspace-wide issue list one click from the top. Before this change `/tasks` was reachable only through team pages, search and deep links.

## What changed

| Layer            | File                                                      | Change                                                                  |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Contract         | `src/features/Navigation/sidebarContract.ts`              | `tasks` joins `FIXED_PRIMARY_KEYS` and leaves `LEGACY_PRIMARY_KEYS`     |
| Default order    | `src/store/global/selectors/systemStatus.ts`              | `tasks` joins `DEFAULT_SIDEBAR_ITEMS` and leaves `RETIRED_SIDEBAR_KEYS` |
| Nav item         | `src/hooks/useNavLayout.ts`                               | `ListTodoIcon`, `tab.issues`, `/tasks`                                  |
| Sidebar body     | `src/features/HomeSidebar/Body/index.tsx`                 | `tasks` is a core key, so it has no hide action                         |
| Customize dialog | `src/features/HomeSidebar/Body/CustomizeSidebarModal.tsx` | Pinned Issues row                                                       |
| Copy             | `packages/locales/src/default/common.ts`, en-US, zh-CN    | `tab.issues`                                                            |

The route, its skeleton and the router tree are unchanged.

## Accounts with a persisted sidebar

`systemStatusSelectors.sidebarItems` returns `DEFAULT_SIDEBAR_ITEMS` and never reads the stored or workspace-synced order, so an account whose `sidebarItems` was saved before this change gets the Issues row without a storage migration. Hides are a separate list (`hiddenSidebarSections`) and are left as stored: an optional section the user hid stays hidden.

`tasks` is a core key like Inbox and My issues. A `tasks` entry left in `hiddenSidebarSections` from the pre-convergence sidebar, where the key meant a different surface, is ignored.

## Decisions left as they are

**Create row and header new-issue icon are not duplicates.** The header icon (`src/features/HomeSidebar/Header/index.tsx`) calls `createTaskModal()` directly and shows the `CreateTask` hotkey. The body `create` row (`src/features/HomeSidebar/Body/CreateRow.tsx`) is a `+` button that opens a menu: new conversation, new group chat, new agent, new issue, new goal, new project and new view. Removing either would drop an entry point, so both stay.

**Reviews stays a top-level entry.** `/reviews` is not a filter over issues in a review state. It is a GitHub pull request queue (`pullRequestService.queue('for-me' | 'created')`) with its own detail page, review threads, checks panel and an approve / request-changes / comment submit flow (`src/features/Reviews`). It is left untouched.

**Agent and Group secondary sidebars are unchanged.** The reference commit added an Issues row there by replacing the Home and New topic rows, which this change does not take.
