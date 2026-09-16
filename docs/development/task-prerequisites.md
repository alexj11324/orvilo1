# Issue prerequisites

The task detail sidebar includes **Prerequisites** (前置任务). Add a task by searching its identifier or title; remove a prerequisite using its row's remove action. The same panel is available in the full task page and task-detail portal.

## Completion contract

A `blocks` edge means that the dependent task requires the prerequisite to have status `completed`. Every blocking prerequisite must be completed: two prerequisites are an AND condition, not an OR condition. Canceled, failed, paused, scheduled, running, unknown, and inaccessible prerequisites do not satisfy the gate. `relates` edges are informational and do not block.

The server enforces this contract when reserving an execution or advancing task status to running/completed, including logged, conditional, and bulk lifecycle writes. The Run button is a convenience, not the security boundary. An unmet prerequisite produces `PRECONDITION_FAILED` at supported RPC execution/status endpoints. A confirmed atomic family completion may satisfy edges within that same family, but cannot bypass an incomplete prerequisite outside it.

Prerequisites must remain in the same project (or both have no project), within the caller's accessible ownership scope. Shared tasks cannot acquire private prerequisites. Self-dependencies and directed cycles are rejected. Existing related-task edges can be upgraded to blocking edges. Adding prerequisites to a running or completed task requires pausing or reopening that task first.

An inaccessible prerequisite is displayed without its identifier or title, remains blocking, and can be explicitly unlinked by an authorized editor using its dependency-edge ID. Reopening a completed prerequisite re-blocks a waiting dependent on its next readiness check; this feature does not automatically interrupt an already-dispatched agent run.

## Scheduling and refresh

A blocked cron or heartbeat tick is a dependency wait, not a failed execution, and must not consume an execution quota. Heartbeat deferral re-arms the next tick. The mounted detail periodically reconciles upstream status changes, so completing the last prerequisite updates readiness without reloading the page. Existing paused-task semantics remain unchanged: becoming ready does not automatically resume a manually paused task.

## Regression evidence

- `packages/database/src/models/__tests__/taskPrerequisites.test.ts`: AND semantics, invalid graphs, concurrent edges/start, ownership, bulk transitions, and candidate search.
- `src/features/AgentTasks/AgentTaskDetail/TaskPrerequisites.test.tsx`: picker, mutations, permission and error states.
- `e2e/src/features/regression/task-prerequisites.feature`: real-browser add/remove, 0/2 and 1/2 blocked, cancellation, 2/2 ready, and RPC rejection.

CI completion must be verified at the tested head SHA. A workflow with skipped test jobs is not evidence that the tests passed. Browser screenshots are retained with the E2E artifacts. Tests, product acceptance, and independent review are separate delivery checks.
