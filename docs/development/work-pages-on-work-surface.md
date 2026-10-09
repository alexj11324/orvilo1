# Work pages on WorkSurface

`WideScreenContainer` is the chat reading lane: a centered `min(960px, 100%)` column that follows the
chat "wide screen" preference. DESIGN.md says work pages must not use it. Work and collection pages
mount `WorkSurface` and one of its frames instead:

- `WorkSurfaceCollection` for lists, tables and boards (full width, 16px gutters).
- `WorkSurfaceDocument` for detail and form pages (fixed 960px cap, 16px gutters, no chat preference).

Page titles use the My Work / Teams style: `text-sm font-medium`. Pages that show a breadcrumb keep it.

## Migrated pages

| Page                                                  | Before                                                       | After                                          |
| ----------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Issues list (`AgentTasksPage`, 3 collection variants) | `WideScreenContainer fullWidth` + `px-4 py-4`                | `WorkSurface` + `WorkSurfaceCollection`        |
| Tasks route skeleton                                  | `WideScreenContainer fullWidth`                              | `WorkSurface` + `WorkSurfaceCollection`        |
| Automations list                                      | `WideScreenContainer fullWidth`, 24px inline, 15px/600 title | `WorkSurfaceCollection` (16px), 14px/500 title |
| Automation runs                                       | `WideScreenContainer fullWidth`, 24px inline, 15px/600 title | `WorkSurfaceCollection` (16px), 14px/500 title |
| Automation detail                                     | `WideScreenContainer`                                        | `WorkSurfaceDocument`                          |
| Automation create                                     | `WideScreenContainer`                                        | `WorkSurfaceDocument`                          |
| Agents list (`AgentViewAllPage`)                      | `WideScreenContainer`                                        | `WorkSurfaceCollection`, 14px/500 title        |
| Resource access (`ResourceAccessPage`)                | `WideScreenContainer`                                        | `WorkSurfaceDocument`                          |
| Agent permission                                      | `WideScreenContainer`                                        | `WorkSurfaceDocument`                          |
| Agent usage                                           | `WideScreenContainer`                                        | `WorkSurfaceDocument`                          |

## Not migrated

- Chat surfaces, `Conversation`, `PageEditor`, `Portal/Document` and `SelfLearning` keep the chat lane.
- Projects, Reviews, Goals, Inbox, group pages (`GroupPermission`) and `AgentTaskDetail` are owned by
  other changes.
