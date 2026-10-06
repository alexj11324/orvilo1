# Approved Issue UI corrections

Base: `57d1293aa52596dad1599acc341021149caff166`. User-approved scope, 2026-10-06.

## Acceptance contract

1. Root opens the existing Issues board. Sidebar exposes one Issues destination, no duplicate Home and no creation buttons. Create Issue stays the existing page-owned modal; Agent creation belongs to Agents.
2. Reviews is hidden from navigation, customization, commands and hotkeys. Application-owned goal creation is hidden from all UI entry points; native ACP goal capabilities and persisted records remain intact.
3. Issue status uses the board workflow glyph and command in every menu/rail. Projects retain project semantics and use the Linear-style hexagonal status family. No second status model.
4. Project properties reuse existing Issue property controls where their contracts fit: compact content-sized pills, transparent at rest, muted hover/focus. No bordered full-width priority/member fields.
5. Project overview exposes no project orchestration policy or coordinator controls. Orchestration belongs to the board across projects and its policy is internal. No replacement per-project settings entry.
6. Project activity uses a dedicated comment/update composer; normal body typography and separated activity rows. No chat composer framing.
7. Agent identity always uses its runtime brand, never name initials. Real user avatars and group identities retain their own semantics.
8. Group configuration exposes Description and members only. Coordinator is an existing member Agent ID, marked in that row; no separately created supervisor. Shared Agent lifecycle/ACL must remain independent from the Group.
9. Real ACP question -> Inbox notification -> linked Issue and native question UI -> answer returned to the original operation -> original session continues. Completion/comment/mention notifications reuse existing outbox/notification storage. Read/unread/snooze and dismissal must have real persistence.

## Evidence and permitted deltas

User supplied candidate screenshots show oversized bordered planning controls, an orchestration card in Overview, dense activity rows and initials for Agent actors. User explicitly requests their removal/correction.
An authenticated isolated Linear session supplied the reference measurements; its private profile and captures are not published.
Measured project status trigger: 28px high, padding 3px 6px, no border, radius 9999px, transparent default, muted hover; project SVG 16px hexagon. Issue status is 14px circular workflow SVG. Preserve Orvilo theme tokens and user-requested absence of sidebar create actions.
Unmeasured states remain unverified, not inferred matches. Test the actual Electron candidate, populated local fixture, dark/light, normal/narrow, hover/focus/open controls, failures and persisted outcomes. No reference-record mutations.

## Ownership

- navigation: HomeSidebar, Navigation contract, command/hotkey catalogs, UI goal creation callers and home redirect.
- project surface: Projects feature and project icon owner, project activity composer.
- identity/Issue properties: Agent task shared metadata/avatar, Issue status picker and detail property renderer, Agent-actor renderers.
- group: GroupProfile/CreateGroup and group router/model/repository/ownership helpers.
- Inbox: existing notification projection/model, native intervention projection/reply and WorkInbox.
- root: runtime, source-policy retirement integration, acceptance evidence, independent reviews and scoped commits.

## Verification

Project policy retirement boundary: this change removes the Overview card, its client/store
reader and writer, and the Project policy API/model mutation. It does not yet replace the
internal Project execution policy. The current Hatchet watchdog scans globally but its backlog
intake still selects assigned tasks in Projects that opted into auto-dispatch; tiered assignment
uses the Project roster. Linear planning reads Project/Team policy and a Project-owned
coordinator. Agent Signal installs intent, reflection and completion policies. The configured
`orchestratorAgentId` supplies inherited runtime settings for resource-owned coordinators.
The earlier absence finding applies only to a full-board automatic planning/assignment owner;
it does not mean that unified Issue status orchestration is absent. Replacing the internal
Project planning/dispatch policy remains outside this public-surface retirement. Existing
budgets, stop/dependency/permission guards and backlog eligibility remain intact.

Existing cross-project Issue state orchestration is owned by
`apps/server/src/services/taskSettlement/index.ts:34` (`settleTaskExecution`). The actual
Todo/open Issue -> In Progress chain is `taskRunner/index.ts:727` (`reserveRun`) ->
`taskRunner/index.ts:743` (`settleTaskExecution`, `runStarted: true`) ->
`taskSettlement/index.ts:93` (`resolveSettlementPlan`) -> `taskSettlement/policy.ts:132`
(run-start policy; `workflowCategory: 'in_progress'` at line 138) ->
`taskSettlement/index.ts:125` (`resolveWorkflowTransition` onto the Team's exact state) ->
`taskSettlement/index.ts:130` (`applyPlan`) -> reservation/contract/current-state guarded
TaskModel writes at `taskSettlement/index.ts:229`, `:241` and `:250`. These centralized rules
apply across Projects, with per-task ownership and execution fences; they are not a separate
Project planner or a separately selected Agent.

The same owner settles outcomes: `taskRunner/index.ts:883` routes the runtime completion
callback to `taskLifecycle/index.ts:158` (`onTopicComplete`), whose `settleOwned` helper at
`:309` invokes `settleTaskExecution` at `:310`. `taskSettlement/policy.ts:283` routes successful
work requiring review to `in_review` (line 289); otherwise it selects `done` (line 297).
Verify (`services/verify/settle.ts:408`), Goal lease recovery (`services/goal/index.ts:2266`)
and Watchdog (`services/taskWatchdog.ts:163`) also call this settlement owner. The contract is
documented in `docs/development/state-model.md:41`; commit
`60ae4e28ed06e76db6a0c9e180ca666ba9bd915e` introduced centralized settlement on 2026-10-02.

Keep four layers distinct:

- Manual board/status moves: `KanbanBoard.tsx:508` -> shared board move ->
  `src/services/workAttention.ts:34` -> `routers/lambda/workAttention.ts:917` ->
  `TaskModel.update` with domain-revision CAS at `workAttention.ts:994`.
  `useIssueStatusMove.ts:44` shares that write; `shouldAutoRunForWorkflowMove.ts:8` allows
  a manual move into In Progress to request a run, subject to its guards.
- Agent native status commands: `services/toolExecution/serverRuntimes/task.ts:848` ->
  `routers/lambda/task.ts:2552` -> `TaskService.updateStatus`. A running Agent requesting
  its own Issue completion at `serverRuntimes/task.ts:866` records completion intent;
  the lifecycle/settlement owner finalizes it after the run ends.
- Unified execution admission/dispatch: TaskRunner -> TaskDispatch -> CAID decides whether
  authorized execution can start; settlement maps its outcomes into Issue workflow state.
- Automatic planning/assignment: Linear Project/Team planning and backlog tiered assignment
  remain distinct from the existing cross-project state orchestration.

This retirement does not modify any of the execution or settlement chains above, including
TaskModel's Project/checkpoint/verify review requirement. It removes the public Project policy
controls and mutation path without claiming a new full-board planner or changing which
historical backlog tasks can start.

Behavior regressions fail on base and pass on candidate; no stylesheet-source mirror tests. Scoped lint/tests only; `tsgo` is remote CI only. Group deletion must not delete a shared coordinator. A real native answer must continue the same session, not create another run or just persist text. Preserve primary-checkout WIP and other worktrees.
