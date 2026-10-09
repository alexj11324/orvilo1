# UI audit: standalone bug fixes

Eight independent defects found by a static UI audit, fixed together because
none of them depends on another or on a wider redesign.

| #   | Surface                                            | Defect                                                                                                                          | Fix                                                                                                      |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `NavPanel/switcher/SwitcherRow`                    | `className` was the literal string `font-[active ? 500 : undefined]`, so the active row was never bold                          | `cn('truncate', active && 'font-medium')`                                                                |
| 2   | `HeteroSessionImport/SidebarTree`                  | `cn('text-[13px]', cond ? 600 : 400)` passed numbers as class names                                                             | `font-semibold` for the selected scope, `font-normal` / `font-medium` otherwise (the original 400 / 500) |
| 3   | Mobile "me" menu (`useCategory`), `Setting/Footer` | `window.open(url, '__blank')` targets a window _named_ `__blank` that is reused by every later click, and keeps `window.opener` | `'_blank', 'noopener,noreferrer'`                                                                        |
| 4   | `Reviews/useGitHubConnection`                      | Desktop branch opened the hosted Reviews page without `noopener`                                                                | Added `noopener,noreferrer` to the desktop branch only                                                   |
| 5   | `AgentTasks/AgentTaskList/TaskItemSkeleton`        | `width: 'small'` is not a CSS length, so the avatar placeholder had no size                                                     | 18 × 18, the row's `AssigneeAvatar` default                                                              |
| 6   | `HomeSidebar/.../AllAgentsDrawer/Content`          | A failed agent search left the skeleton up forever                                                                              | Error state with retry                                                                                   |
| 7   | `Home/components/GroupBlock`                       | Suspense fallback was the bare string `loading`                                                                                 | `BriefCardSkeleton`, the placeholder the inbox sections inside this block already use                    |
| 8   | Workspace settings → Credentials                   | `width: '100%';` inside a `css` block is invalid and was dropped                                                                | `width: 100%;`                                                                                           |

## Notes

### GitHub connection popup keeps its opener (4)

`useGitHubConnection` calls `window.open` twice. The web popup must **not** get
`noopener`: the hook navigates the returned handle (`popup.location.href`),
polls `popup.closed` as the cancel signal, and the OAuth callback route reports
the result through `window.opener.postMessage`. With `noopener` the call
returns `null` and the flow fails immediately.

The desktop call only hands a URL to Electron's window-open handler, which
passes it to the system browser. Nothing reads the handle, so that call takes
`noopener,noreferrer`.

### Failed agent search (6)

The state decision lives in `AllAgentsDrawer/contentState.ts`. The error branch
is checked before the loading gate, because a failed search has no results and
would otherwise read as "still loading".

The failed state renders the shared `AsyncError` (inline variant). It owns the
status-specific copy and hides Retry for errors a retry cannot fix (401 / 403).
Retry revalidates the same SWR key and the button shows progress while it runs.
The only new copy is the surface title, `navPanel.searchAgentFailed`.

## Verifying on the desktop app

- Workspace switcher: the current workspace row is medium weight.
- Import sessions sidebar: the selected scope ("All sessions" or one source) is
  semibold.
- Home sidebar → all agents drawer: type a keyword with the network offline;
  the list shows "Couldn't search agents" with a retry, and retry recovers once
  the network is back.
- Skeleton gallery (the only current consumer of the default task row
  skeleton; the kanban uses the compact variant): the row shows the round
  avatar placeholder.
- Workspace settings → Credentials: the list container spans the full width.
