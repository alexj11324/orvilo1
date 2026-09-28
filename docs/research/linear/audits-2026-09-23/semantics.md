# Semantic Parity Audit — Orvilo ↔ Linear

**Scope**: every domain concept rendered on the Linear-parity surfaces, verified for _meaning_ (not just appearance). Worktree `devin/v6-linear-polish`, audit date 2026-09-23.

**Method note**: this audit was triggered by the `offTrack`-checkmark bug class — an icon that looked right but meant the wrong thing. Every concept below was therefore checked against its _data source and mutation path_, not its pixels.

## Executive summary

The branch is in good semantic shape: health/status/priority/triage all resolve to the right backend fields, unsupported features are disabled or omitted rather than faked, and the codebase carries unusually honest comments about what it cannot claim. **F1 (route file) was verified a false positive** — `src/routes/(main)/project/[projectId]/tasks/index.tsx` exists on disk; the auditor's glob did not handle the paren/bracket path. Two P1s (Reviews For-you contract gap; no project-update edit/delete path). A handful of P2/P3 gaps and copy inconsistencies, all itemized below.

## 1. Project Health — ✅ Correct

- **Model**: `PROJECT_HEALTH_STATES = ['onTrack','atRisk','offTrack']`, explicitly documented as "carried by project updates" (`packages/types/src/project/index.ts:51-54`). Update kinds split `update`/`comment` (`:56-59`).
- **Icon**: shared `ProjectHealthIcon` renders a **filled `CircleIcon`** in the semantic color for the three states and a **gray `CircleDashedIcon`** for missing/invalid — exactly the fix for the original bug (`src/features/Projects/healthMeta.tsx:9-49`, covered by `healthMeta.test.tsx`).
- **Backend**: `createUpdate` writes `health` only when `kind === 'update'` (default `onTrack`) and denormalizes `projects.health` only then (`packages/database/src/models/project.ts:1690-1717`). `listUpdates` returns newest-first with `health` per row (`:1613-1631`). `project.list` selects `getTableColumns(projects)` so `health` is the real column; `null` = no updates (`:706-734`). **No `updateUpdate`/`deleteUpdate` exists** — denormalized health cannot drift via edit/delete (see Gap §G5).
- **Click-through**: the list health cell is a real navigation target → project Activity surface, with `state:{projectUpdate:true}` opening the composer in update mode when no update exists (`src/features/Projects/List/index.tsx:106-130, 350-371` → `src/features/Projects/Activity/ProjectActivityPage.tsx:453-454`). ✅ matches Linear's "click health → update surface".
- **Composer honesty**: comment mode posts `health: undefined, kind:'comment'`; update rows show the health Tag only when set; Overview filters `kind !== 'comment'` (`src/features/Projects/Updates/index.tsx:158-167, 281-290`; `Workspace/projectOverviewUpdates.ts:4`).
- **Filters/sort**: the health filter includes an explicit "No updates" (`null`) option (`List/AddFilterPopover.tsx:437-467`); health sort ranks worst-first with no-update last (`List/displayOptions.ts:319-357`, test `:183-201`).
- **Board/timeline**: reuse `PROJECT_HEALTH_META`/`ProjectHealthIcon` with invalid→no-update fallback (`List/ProjectBoard.tsx:192-200`; `List/ProjectTimeline.tsx:291-302`). Minor: these are tooltip-only, not click-through — acceptable, but noted.
- **Team Projects sidebar**: buckets real health counts and reports a separate `updateMissing` count instead of folding missing into a bucket (`src/features/WorkTeams/teamProjects.ts:77-113`).

**Copy**: en `On track / At risk / Off track / No updates` and zh `正常推进 / 有风险 / 偏离轨道 / 暂无更新` — correct and distinct from status vocabulary.

## 2. Project Status — ✅ Correct (with intentional extensions)

- `PROJECT_STATUSES = backlog, planned, active, paused, reviewing, completed, canceled, archived` (`packages/types/src/project/index.ts:3-12`); `PROJECT_CREATABLE_STATUSES` excludes `reviewing`/`completed` (`:17-24`).
- Shared visuals via `PROJECT_STATUS_VISUALS` + `resolveProjectStatus` (invalid → `backlog`) in `src/components/ExecutionStatus.ts`; consumed identically by list columns, board headers, timeline, and the project header chip.
- Overview status picker lists only settable statuses and locks lifecycle when `reviewing` or `archived`+`completedReviewId` (`Workspace/index.tsx:144-209`) — `reviewing`/`completed` are flow-terminal, matching the type split.
- **Intentional divergence**: `reviewing` ("In Review") and `archived` are Orvilo extensions of Linear's 6-state lifecycle, tied to the completion-review flow. Not a conflation — health is never rendered through the status map.
- **Progress**: `progressPercent` computed from `workflowCategory` (done ÷ non-canceled), returning `null` when any task carries an unrecognized category — surfaces "progressUnavailable" rather than a misleading number (`packages/database/src/models/project.ts:715-727`; `Layout/ProjectIssueProgress.tsx:42-45`). Uses the _business_ category, not execution status — correct.

**Copy**: `active`="In Progress"/ 进行中，`reviewing`="In Review"/ 审核中，`archived`="Archived"/ 已归档 — consistent en+zh.

## 3. Issue Status vs workflowCategory vs triageStatus — ✅ Correct

Three separate columns with separate field specs (`packages/types/src/workAttention.ts:312-337`; schema `packages/database/src/schemas/task.ts` keeps `status`, `workflowStateId`, `workflowCategory`, `triageStatus` distinct).

- Execution statuses: `backlog/scheduled/running/paused/failed/completed/canceled`; workflow categories add `triage/todo/in_progress/in_review/done`; triage `untriaged/accepted/declined/duplicate`.
- Kanban: `STATUS_KANBAN_COLUMNS` merges `paused+failed → needsInput`, `running+scheduled → running`; drops within `needsInput` preserve membership rather than rewriting `failed→paused` (`AgentTaskList/kanbanBoardModel.ts`; `KanbanColumn.tsx` column-key namespaces `st:*`/`wf:*` are explicit). Linear-linked tasks route through `moveBoard` + `WORKFLOW_STATE_REQUIRED` picker; unlinked tasks use local status (`MyWork/workQueryBoardMove.ts`).
- Team queries: `active` = `workflowCategory in (todo,in_progress,in_review)`, `backlog` = `eq backlog`, `all` unrestricted; triage-capable teams exclude `triageStatus=untriaged` from normal scopes; triage query selects `untriaged`; board groups `workflowCategory`, list groups `status` (`WorkTeams/teamWorkQuery.ts:36-92`).
- `TaskWorkflowBadge` renders the business category separately and flags "delivery pending" when `done` category meets non-completed execution (`AgentTasks/shared/TaskWorkflowBadge.tsx`).

**Intentional divergence**: execution `paused` is Orvilo's human review gate — `reviewerUserId` is auto-stamped on the paused transition and shown as a separate "Reviewer" property row (`AgentTaskDetail/TaskProperties.tsx:153-208`). Label "Pending review"/ 待审阅 is deliberate but creates a copy inconsistency (see §Copy).

## 4. Priority — ✅ Correct; one filter-spec defect

- Shared `PriorityIcon` implements the exact Linear glyph set: 0=none (three dots), 1=urgent (orange block), 2=high (3 bars), 3=medium (2 bars), 4=low (1 bar) (`src/components/PriorityIcon/index.tsx:21-126`); `resolvePriorityLevel` clamps invalid→0.
- Task editor offers all 5 levels (`AgentTasks/features/TaskPriorityTag.tsx:27-33`); project create offers 0-4 (`Projects/CreateProjectContent.tsx:98`); project board/list aria-labels map 0-4 correctly (`List/ProjectBoard.tsx:184-190`).
- **DEFECT (P2)**: `TASK_PRIORITY_VALUES = [0,1,2,3]` omits `4` (`packages/types/src/workAttention.ts:339,367`). The saved-view/My-Work filter builder builds its Select from `spec.enumValues` (`SavedViews/WorkQueryFilterBuilder.tsx:243-259`), so "Low" can never be picked — despite `savedViews.values.priority.4`="Low" existing (`locales/en-US/common.json:806`) and the server compiling `priority` generically (`packages/database/src/models/workQuery.ts:208-210`). Label exists, backend honors it, UI can't reach it.

## 5. Dates — ✅ Correct

- Project list columns map `startDate / targetDate / createdAt / updatedAt / completedAt` to the right fields (`List/index.tsx`); timeline renders `startDate → targetDate` (`List/ProjectTimeline.tsx`); overview has separate start/target pickers with a server-side `target >= start` invariant (`project.ts:755-760`). No created↔target swap found.
- Relative time via `useActivityTime`/`formatTaskItemDate` with `normalizeDayjsLocale`; triage age uses language-neutral `m/h/d/w/mo/y` (`WorkTeams/triage/teamTriageRowModel.ts:107-130`).
- Update rows render `createdAt` as `MMM D` (`Updates/index.tsx:292`) — update date, never confused with project dates.

## 6. Assignee / Lead / Creator — ✅ Correct

- Schema separates `createdByUserId/AgentId`, `assigneeUserId/AgentId`, `reviewerUserId` (`packages/database/src/schemas/task.ts`).
- Project lead `leadUserId` validated against active workspace membership on write (`project.ts:746-753`); lead cell resolves via members query, never fabricates a name (`List/index.tsx:375-399`).
- Triage creator chip: member profile → `createdBySnapshot.displayName` → absent (covers agents/departed members honestly) (`teamTriageRowModel.ts:80-89`).
- `Me`: `{ref:'currentUser'}` is the only supported value ref, resolved server-side (`workQuery.ts:184-192`); `useUserDisplayMeta` falls back to the signed-in profile only when the id is the current user.
- Issue detail shows member-assignee, agent-assignee, and reviewer as distinct rows (`TaskProperties.tsx`); task rows separate member/agent assignees (`AgentTaskItem.tsx`).

## 7. Visibility / Favorite / Milestone / Labels — ✅ Correct

- Project `visibility` private/public is a real column + field spec (`workAttention.ts:351,428-433`); favorites are `NavigationFavorite` rows with read-gated titles (`workAttention.ts:676-685`).
- `MilestoneChip` reads only the project-detail cache and renders nothing when detail isn't loaded (`List/MilestoneChip.tsx`); issue rows render milestones only for resolved references.
- Project labels exist (`listLabels`, validated per-workspace on write, `project.ts:565,761-782`). **Scope note**: tasks have no label field — issue labels are absent rather than faked (worth stating in the report as a known non-goal).

## 8. Triage — ✅ Correct; snooze honestly disabled

- Actions map to `workAttention.triage`: accept→`accepted`, decline→`declined`, duplicate→`duplicate`+canonical validation, reassign→`accepted`+assignee; optimistic concurrency via `domainRevision` (`apps/server/src/routers/lambda/workAttention.ts`; `teamTriageRowModel.ts:44-61` returns `null` rather than issuing a guard-less write).
- **Snooze renders disabled** with `teams.snoozeUnavailable` tooltip — schema has no snoozed column/state (`teamTriageRowModel.ts:24-31`, locked by `teamTriageRowModel.test.ts:122-125`). Honest absence. P3 capability gap vs Linear.

## 9. Inbox — ✅ Correct; one documented semantic gap

- Read/unread/archive/snooze are distinct mutations with observed-revision guards (`packages/database/src/models/notification.ts:605-644`); bulk `archive` and `mark_read` are separate dispatches over a prepared cutoff (`:516-560`). Mark-all-read and archive-all are **not** swapped.
- "Delete all" → archive is a documented mapping (archived cards recoverable under the Archived filter); "Delete all read"/"Delete all completed" are omitted because no bulk filters exist (`src/features/WorkInbox/inboxHeaderMenuModel.ts:15-24`).
- Detail pane mounts the real shared `IssueContent` for task-linked cards — detail actions target the actual task (`WorkInboxPage.tsx:1043-1153`); non-task cards expose only real decision verbs and an allowlisted navigation URL (`workAttention.ts:532-597`).
- **GAP (P2, documented)**: snooze sets `snoozedUntil` but "snoozed cards stay listed in every view" (`WorkInboxPage.tsx:565-574`) — the server only suppresses the unread badge (`notification.ts:322`). Linear _hides_ the item until wake. The display-options popover openly omits Linear's snoozed-visibility/unread-first toggles (`WorkInboxPage.tsx:894-896`).

## 10. Reviews — ⚠️ Partial (documented contract gap)

- For-you lane queries `review-requested:<viewer>` only (`apps/server/src/services/pullRequestReview/index.ts:~874`) — authored PRs without a pending request never reach the lane; the grouping code documents this contract gap explicitly (`src/features/Reviews/reviewQueueGroups.ts:56-60`). **P1** — full parity needs author ∪ review-requested plus mergeable/check fields.
- Buckets: `APPROVED`→Ready to merge; `author===viewer`→Created by you; rest→Pull requests; Created tab is a single Open group (`reviewQueueGroups.ts:62-93`). **P2**: `APPROVED` proxies "mergeable" — check-run rollup only loads on the detail surface, so an approved-but-failing PR overstates readiness.
- Mutations are real GitHub review submissions (`APPROVE/COMMENT/REQUEST_CHANGES`) with `headSha` stale-guard + idempotent `operationId`s (`Reviews/ReviewPullRequestPage.tsx:311-352`). "Request changes" is the correct verb (GitHub has no "reject"). External reviews never materialize fake tasks (`workAttention.ts:599-608`).
- `?tab=review` deep links redirect to `/reviews?tab=for-me` (`MyWorkPage.tsx:814-817`) — for-you ≠ created-by-you preserved.

## 11. My Issues — ✅ Correct

- Tabs `assigned/created/subscribed/activity`; `delegated` is a `?delegated=1` filter chip, never a tab (`MyWorkPage.tsx:156-168`, 307-311, 828-830).
- Attention grouping is server-computed: urgent (`priority=1`) open issues, then blocking, then status — with visibility checks so invisible downstream tasks can't leak (`packages/database/src/models/workQuery.ts:533-548, 975`).
- Subscribed uses real `subscribedTaskIds`; activity uses notification timestamps.

## 12. Team surfaces — ✅ Correct

- Issues/Triage scopes per §3. Projects tab joins the workspace list projection for computed columns; unmatched rows pass through with `—` fallbacks instead of faked counts (`teamProjects.ts:38-52`). Sidebar aggregates health/lead buckets and deliberately omits a Teams section it can't compute (`:72-76`).

## 13. Drafts / Views / Members — ✅ Correct

- Drafts: server comment-drafts + localStorage issue-drafts, honestly labeled (`TaskDrafts/TaskDraftsPage.tsx:222-224`); discard-all covers both.
- Views: builder preserves non-renderable predicates and `any` subtrees verbatim (`SavedViews/workQueryBuilder.ts:26-99`); directory sections follow real `visibility` (private→Personal, else shared) — documented wording choice (`savedViewDirectory.ts:20-31`); builtin `builtin:*` views are virtual, not rows (`workAttention.ts:635-656`).
- Members: three real sources; "Application" band deliberately absent (no applications source), `removed` band kept real though unreachable (`Members/directoryRows.ts:17-22, 76-97`).

## 14. Activity feed — ✅ Exemplary honesty

`deriveProjectEvents` documents exactly what each event can claim: milestone `updated_at` events omitted because `reorderMilestones` rewrites it; only latest lifecycle transition survives; deleted tasks excluded so no dead links (`Projects/Activity/activityFeedItems.ts:26-44, 130-187`).

## 15. Locale copy (en + zh)

Correct: health terms; project statuses; priority labels (task `Normal`/ 普通 vs project `Medium`/ 中等 — same value 3, two names, **P3**); inbox actions; reviews verbs; triage verbs.

Issues:

- **`paused` dual labels (P3)**: task `paused`="Pending review"/ 待审阅 vs project `paused`="Paused"/ 已暂停 vs `savedViews.values.status.paused`="Paused" — same field named two ways across surfaces.
- **zh "backlog" ×3 (P3)**: `status.backlog`= 待办，`workflowCategory.backlog`= 待办池，`teams.scope.backlog`= 待排期.
- **zh "issues" ×2 (P3)**: `teams.navIssues`= 问题 vs `teams.subNav.issues`= 任务 (same team chrome); `sections.issues`= 问题.
- `inbox.filterSnoozed` zh = 稍后 is thin vs "Snoozed"; `teams.accept` zh = 接纳 acceptable but 接受 is more standard. Minor.
- `inbox.deleteAll`= 全部删除 / Delete all maps to archive — matches Linear's own label semantics; honest.

## Findings

| ID  | Sev       | Finding                                                                                                                                                                                                | Evidence                                                                                                           |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| F1  | ~~P0~~ ✅ | Route `src/routes/(main)/project/[projectId]/tasks/index.tsx` reported absent — **verified present on disk**; auditor glob mishandled paren/bracket path. No action.                                   | `ls src/routes/(main)/project/[projectId]/tasks/`                                                                  |
| F2  | **P1**    | Reviews For-you = `review-requested:<viewer>` only; authored PRs w/o pending request invisible (documented contract gap)                                                                               | `Reviews/reviewQueueGroups.ts:56-60`; `apps/server/src/services/pullRequestReview/index.ts:~874`                   |
| F3  | **P1**    | No update edit/delete — `projects.health` can't drift, but Linear's update management is absent entirely                                                                                               | `packages/database/src/models/project.ts` (only `listUpdates`/`createUpdate` exist)                                |
| F4  | **P2**    | `TASK_PRIORITY_VALUES` omits `4` (Low) — filter builder can't express it though server+locale support it                                                                                               | `workAttention.ts:339,367`; `WorkQueryFilterBuilder.tsx:243-259`; `common.json:806`; `models/workQuery.ts:208-210` |
| F5  | **P2**    | Inbox snooze doesn't hide the card — badge suppressed only; Linear hides until wake                                                                                                                    | `WorkInboxPage.tsx:565-574`; `notification.ts:322`                                                                 |
| F6  | **P2**    | "Ready to merge" bucket = `APPROVED` proxy; no check-rollup → can overstate mergeability                                                                                                               | `reviewQueueGroups.ts:46-53`                                                                                       |
| F7  | P3        | `paused` labeled "Pending review" on tasks vs "Paused" in saved-views/projects                                                                                                                         | `chat` ns `taskDetail.status.paused`; `common.json:813`                                                            |
| F8  | P3        | Priority 3: "Normal / 普通" (task) vs "Medium / 中等" (project/saved-views)                                                                                                                            | `TaskPriorityTag.tsx:31`; `CreateProjectContent` `create.priority.normal`; `common.json:805`                       |
| F9  | P3        | zh backlog ×3 (待办 / 待办池 / 待排期); zh issues ×2 (问题 / 任务); thin zh `稍后` for Snoozed                                                                                                         | `locales/zh-CN/{project,chat,common,notification}.json`                                                            |
| F10 | P3        | Health icon tooltip-only on board/timeline (no click-through); list cell is correct                                                                                                                    | `ProjectBoard.tsx:192-200`; `ProjectTimeline.tsx:291-302`                                                          |
| F11 | P3        | Triage snooze disabled (no schema support) — honest, tracked                                                                                                                                           | `teamTriageRowModel.ts:24-31`                                                                                      |
| F12 | —         | Intentional divergences to record: `reviewing`/`archived` project states; task `paused` review gate; delegated-as-filter; no Applications band; workflow-category progress; `needsInput` merged column | throughout                                                                                                         |

## Prioritized remediation

- **P1**: Extend the review search contract to author ∪ review-requested with mergeable/check fields (F2); decide whether project updates get edit/delete — if not, document as capability boundary (F3).
- **P2**: Add `4` to `TASK_PRIORITY_VALUES` (F4); give inbox snooze real hidden-until-wake semantics or relabel honestly (F5); include check-rollup in the ready-to-merge signal or relabel the bucket (F6).
- **P3**: Unify copy for `paused`, priority-3, zh backlog/issues terms; consider health click-through on board/timeline; keep triage-snooze flag tied to schema (F7-F11).
