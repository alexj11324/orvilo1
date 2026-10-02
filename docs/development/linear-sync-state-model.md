# Linear Sync State Model

The product keeps two state axes that must never be conflated:

- **Issue Status (canonical, business)** — `tasks.workflow_category` +
  `tasks.workflow_state_id` (remote UUID) + `tasks.workflow_state_ref_id`
  (FK into `team_workflow_states`).
- **Execution truth** — `task_dispatch.phase` and `task_topics.run_state`
  (`tasks.status` is the execution lifecycle projection of those).

Lifecycle transitions flow only through the settlement policy / ownership
handoff — never through Linear sync.

## Inbound (Linear → Orvilo)

`LinearSyncWorker` projects a Linear issue's `stateId` onto the workflow
axis only: `workflowStateId` → `workflowStateRefId` → `workflowCategory`
(the last resolved from `statusMappings` or the synced team state's
category). Inbound deliveries run with `source: 'linear'` +
`suppressLinearOutbox` + `suppressDomainEvent`, which closes the
inbound→(workflow)→outbound echo at the model layer
(`recordTaskChangeInTransaction` early-returns).

Inbound sync **never writes execution state** (`tasks.status`,
`run_state`, `task_dispatch.phase`). The one structural exception that
used to exist — a remote agent reassignment on a `running` task fencing
its live dispatch via `transferTaskExecutionOwnership` — is demoted:
`deferRunningTaskAssignee` strips the assignee write and the issue link
records an `assigneeId` conflict with `syncState: 'conflict'` (the last
confirmed base is kept so the field still diffs). A human resolves it:
`keep_linear` applies the remote assignee through the ownership handoff
(park + reassign), `keep_local` pushes the local assignee back to Linear.
`LinearIntegrationTaskService.updatePublicTask` retains the transfer only
for such human-initiated writes.

## Outbound (Orvilo → Linear)

Local workflow moves queue an `update_issue` outbox row **only** when
`workflowCategory`/`workflowStateId` actually changed — the remote
`stateId` resolves from `statusMappings[].workflowCategory` (or the
synced `team_workflow_states.remoteStateId` for team-scope links). Pure
execution transitions (`status`, `run_state`, dispatch writes) produce an
empty payload and therefore no outbox row.

## `LinearStatusMapping.localStatus`

Read-only legacy projection: still parsed so stored legacy bindings load
(the tRPC settings schema still accepts it), but it is never consulted to
set execution state, never used to resolve remote states, and must not be
authored for new mappings — use `workflowCategory`. The settings UI
displays `workflowCategory`, falling back to `localStatus` only for
legacy rows.
