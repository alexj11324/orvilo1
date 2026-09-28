# Icon sharing & consistency audit — Orvilo↔Linear parity

**Branch:** `devin/v6-linear-polish` · **Date:** 2026-09-23 · **Mode:** read-only audit

**Rule under audit:** the same concept renders the same icon via the SAME shared component/mapping on every surface.

## Executive summary — top findings

1. **Project "active" status has two glyphs.** Only the projects-list row (`List/index.tsx:638`) and the properties card (`ProjectPropertiesCard.tsx`) render the measured `ProjectActiveStatusIcon`; overview trigger, tab header tag, board columns, saved-view rows/board, group headers and every status dropdown render generic `CircleDot` instead.
2. **"Project" entity has five glyphs.** `FolderClosedIcon` (route meta, sidebar tree, empty states), `FolderKanbanIcon` (workspace nav, Recents, favorites, team home), `BoxIcon` (list/board row fallback), `FolderIcon` (MyWork groups + project tags, board card tag), `FolderXIcon` (team empty states). No shared mapping.
3. **`CircleDashed` overloaded ≥7 meanings** (triage, no-health, pending check, pending sync, unassigned ring, no-reviews, Status affordance) — emergent, not codified.
4. **Workflow `todo`/`triage` in two disagreeing maps** — `CATEGORY_META` vs `COLUMN_STATUS_VISUAL` differ on icon AND color.
5. **Notification-type icons are page-local** (`INBOX_TYPE_ICON` in WorkInboxPage:272-283).
6. **"Unassigned human" renders 3 different glyphs** (`CircleUser` / `CircleDashed`+`UserRound` composite / plain `UserRound`), plus `NoLeadIcon` for project lead.
7. **Task status & priority genuinely consolidated** — `TASK_STATUS_VISUALS`/`TaskStatusIcon`/`PRIORITY_ICONS`/`PriorityIcon` cover every audited surface.
8. Mirror pair `ArrowLeftRight` vs `ArrowRightLeft` both used for transfer/change.

## Divergence table (concept | canonical | divergent sites | severity)

- Issue/task status | `TASK_STATUS_VISUALS`+`TaskStatusIcon` | `TaskProperties.tsx:29-49` redeclares label maps; `StatusGlyph.tsx:17` stale comment | low
- Workflow category | `CATEGORY_META` (TaskWorkflowBadge) | `KanbanColumn.tsx:306-316` second map disagrees on todo/triage icon+color | medium
- Priority | `PriorityIcon`/`PRIORITY_META` | none material | none
- Project status | `PROJECT_STATUS_VISUALS`+`ProjectActiveStatusIcon` | active→generic CircleDot at Workspace:206,255; TabsBar:183; SavedViewPage:186,231; ProjectBoard:110; AddFilterPopover:412; List group header:821 | **high**
- Project health | `ProjectHealthIcon`/`PROJECT_HEALTH_META` | AddFilterPopover:447-462 health picker rows lack icon | low-med
- Assignee | AssigneeAvatar/AssigneeUserAvatar/UnassignedAssigneeIcon | 3 unassigned-person glyphs + NoLeadIcon | medium
- Milestone | `MILESTONE_ICON_PAINT`+DiamondIcon | :627/:684/:701 bare unpainted DiamondIcon | low
- Label | `LabelChip`+palette | WorkspaceSetting/Labels own 10px dot | low-med
- Visibility | Lock/Users map duplicated ×3 | TaskListVisibilityFilter:18-30 | low-med
- Favorite | WorkFavoriteButton pin/star | FavoriteToggle raw Star; teamMenu raw Pin | low-med
- Triage concept | none | Inbox / ArrowRight / CircleDashed / ListChecks — 4 glyphs | medium
- Notification type | none (page-local map) | WorkInboxPage:270-283 | med-high
- Review state | local maps | prStateVisual preset strings vs cssVar siblings | low
- **Project entity** | none | 5 glyphs across 15+ sites | **high**
- Task entity | none | ListTodo vs ListChecks | medium
- Saved view | none | LayoutList vs Bookmark vs Layers2 | low-med
- Team entity | TeamIdentity + UsersIcon | Layers for Teams section vs UsersIcon | low
- Goal | TargetIcon | FlagIcon in GoalsRailCard:114 | low-med
- Inbox | InboxIcon | shared w/ triage subnav | low

## Overload register (same icon, different meanings)

`CircleDashed`: triage bucket · triage badge · no-health · unassigned ring · pending check · pending sync · no-reviews · Status affordance (\~8 sites, no shared constant).
`CircleDot`: backlog · running/active · planned · todo badge · status-changed event · status affordance · unread fallback.
`InboxIcon`: notification inbox · topics inbox · triage subnav.
`Users`/`UsersRound`: team entity · public visibility · members route · filter groups.
`ListChecksIcon`: issues nav · triage empty states.
`GitPullRequestIcon`: green open-PR · secondary external row · plain notification/empty.
`ArrowLeftRight` vs `ArrowRightLeft`: same "change/transfer" meaning, mirrored glyphs.

## Consolidation fix list

| site                                                                                                                                                                       | action                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| All `active`→CircleDot fallbacks (Workspace:206,255 · TabsBar:183 · SavedViewPage:186,231 · ProjectBoard:110 · AddFilterPopover:412 · List:821 · PropertiesCard:152 menus) | New `ProjectStatusIcon({status,size,percent})` → `ProjectActiveStatusIcon` for active else `PROJECT_STATUS_VISUALS` glyph |
| 15+ project-entity sites                                                                                                                                                   | `PROJECT_ENTITY_ICON`/`TASK_ENTITY_ICON`/`SAVED_VIEW_ENTITY_ICON`/`TEAM_ENTITY_ICON` shared module                        |
| KanbanColumn vs TaskWorkflowBadge maps                                                                                                                                     | shared `WORKFLOW_CATEGORY_VISUALS`                                                                                        |
| WorkInboxPage:270-283                                                                                                                                                      | extract `INBOX_TYPE_ICON` shared module                                                                                   |
| 3 unassigned glyphs                                                                                                                                                        | converge on `UnassignedAssigneeIcon kind='human'`                                                                         |
| AddFilterPopover health picker                                                                                                                                             | pass `ProjectHealthIcon` like status/priority pickers                                                                     |
| Milestones :627/:684/:701                                                                                                                                                  | `MilestoneIcon({size,muted})` wrapper                                                                                     |
| visibility map ×3                                                                                                                                                          | shared `TASK_VISIBILITY_ICONS`                                                                                            |
| teamMenu/FavoriteToggle                                                                                                                                                    | route through `WorkFavoriteButton` pin/star convention                                                                    |
| TeamHomeOverview:215-219 triage arrow                                                                                                                                      | triage entity icon (Inbox) or uniform text+arrow                                                                          |
| TaskProperties:29-49                                                                                                                                                       | import shared labelKey maps                                                                                               |
| StatusGlyph:17 stale comment                                                                                                                                               | fix to Clock+purple                                                                                                       |
| prStateVisual preset strings                                                                                                                                               | cssVar + translate at call site                                                                                           |
| ArrowLeftRight vs ArrowRightLeft                                                                                                                                           | pick one direction                                                                                                        |
| GoalsRailCard FlagIcon                                                                                                                                                     | TargetIcon / GOAL\_ENTITY\_ICON                                                                                           |

**Severity rollup:** high = project-status `active` split, project-entity 5 glyphs · medium = workflow dual maps, triage spread, notification locality, unassigned fallbacks, task/view entity glyphs · low = rest.
