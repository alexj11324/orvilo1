# Task State Model

Canonical reference for task state semantics. The contract types live in
`packages/types/src/task/stateModel.ts`; the settlement service that owns all
cross-layer transitions lives in `apps/server/src/services/taskSettlement/`.

## Three layers

| Layer              | Meaning                        | Source of truth                                       | Values                                                                                              |
| ------------------ | ------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Issue Workflow** | The user-facing "Issue Status" | `tasks.workflowCategory` + `tasks.workflowStateRefId` | triage / backlog / todo / in_progress / in_review / done / canceled                                 |
| **Execution**      | The agent-run truth            | `task_dispatches.phase` + `task_topics.run_state`     | queued / provisioning / running / waiting / succeeded / failed / canceled / outcome_unknown         |
| **Attention**      | Does this need a human?        | Derived from the other two layers                     | none / needs_input / review_required / execution_failed / blocked / outcome_unknown / needs_changes |

`tasks.status` is a **legacy compatibility projection**, not the Issue Status.
It is still written (paused / completed / scheduled / …) so old readers keep
working, but no code may consult it to decide business state. Its retirement
is a follow-up change.

## Execution projection

`deriveTaskExecutionState({ dispatchPhase, runState, legacyStatus })` is the
single function that folds a task's dispatch/run rows into the canonical
`TaskExecutionState`:

- The row reporting the furthest-advanced state wins (a `waiting` run under a
  still-`running` dispatch reports `waiting`).
- A terminal dispatch phase is the contract fence: it beats a stale run row
  (`succeeded` dispatch + `running` topic → `succeeded`).
- `abandoned` dispatches project `outcome_unknown` — the remote writer's fate
  is unknowable.
- The legacy status is consulted only when no execution rows exist;
  `backlog`/`scheduled` project `null` (no execution to project).

## Settlement policy

All transitions between the workflow and execution layers happen exclusively
through `settleTaskExecution`. Call sites report an outcome; the policy
decides the new state — call sites never pick a status themselves.

| Event                       | Workflow          | Execution         | Attention        | Legacy `tasks.status`                            |
| --------------------------- | ----------------- | ----------------- | ---------------- | ------------------------------------------------ |
| run starts                  | → in_progress     | running           | none             | running                                          |
| run waits for user          | stays in_progress | waiting           | needs_input      | running                                          |
| execution failed            | stays in_progress | failed            | execution_failed | paused (non-automation) / scheduled (automation) |
| success, no review required | → done            | succeeded         | none             | completed                                        |
| success, review required    | → in_review       | succeeded         | review_required  | paused                                           |
| verify passed               | → done            | succeeded         | none             | completed                                        |
| verify failed + auto repair | stays in_progress | queued            | needs_changes    | running                                          |
| verify failed, no repair    | → in_review       | succeeded         | needs_changes    | paused                                           |
| user cancels issue          | → canceled        | cancel active run | none             | canceled                                         |

Invariants the policy enforces:

- `paused` is **not** In Review — the legacy projection can say `paused` for
  several attention reasons (review_required, execution_failed, blocked,
  needs_changes); workflow `in_review` is a distinct column write.
- `failed` execution is **not** `needs_input` attention — a failed run wants
  `execution_failed`; `needs_input` is reserved for waits on the user.
- `succeeded` execution is **not** Done — completion is a policy decision
  (review gate, verify gate), not a consequence of the run ending well.

### Review requirement

`resolveTaskReviewRequirement` decides whether a successful run parks in
`in_review` or completes straight to `done`. It returns `true` when any of:

- the task's explicit checkpoint requires review (`checkpoint.topic.after`),
- the owning project's `orchestrationPolicy.requireHumanReview` is `true`,
- an explicit verify/Aegis gate requires review.

Otherwise `false` — success settles `done` directly. This replaces the old
default-pause (`shouldPauseOnTopicComplete`, now deprecated), under which
every successful root task paused for review.

### Fences and idempotency

- Settlement is fenced by `executionGeneration` / `dispatchFence`: a late
  callback from a superseded run is a no-op.
- Settlement is idempotent: applying the same outcome twice yields the same
  state.
- Workflow writes resolve through `resolveWorkflowMove` — the same
  category → `team_workflow_states` resolution the board move uses, including
  the multi-state ambiguity rule (settlement never guesses a state).

## Reader guidance

- Issue Status: read `workflowCategory` (+ `workflowStateRefId` for the exact
  team state). Never read `tasks.status` for business state.
- Execution: project `task_dispatches.phase` + `task_topics.run_state`
  through `deriveTaskExecutionState`.
- Attention: derive from the layers above via the settlement service's
  attention module.

## Settlement call sites

Every writer of task outcome state delegates to `settleTaskExecution` — no
service picks a status itself:

- `services/taskLifecycle` — run outcomes (complete / pause / cancel /
  dependency-driven writes) go through the service's `settleOwned` helper,
  which injects `taskId`, `operationId`, and the generation fence. A
  stale-generation skip surfaces as `TaskCompletionSupersededError`.
- `services/verify/settle` — each verdict settles via `verifyOutcome`
  (`passed` completes or re-parks scheduled tasks; `failed` drives auto
  repair or parks in review; `errored` / `review_errored` / `unjudgeable` /
  `integration_blocked` route to a person via `blocked` attention).
- `services/taskWatchdog` — unconfirmed cancel settles `outcome_unknown`;
  heartbeat timeout settles `failed`. The legacy projection for a
  heartbeat timeout is now `paused` (execution-failed keeps the issue open);
  it no longer writes `failed`.
- `services/goal` — the lease-expired reclaim inside the reclaim transaction
  settles `outcome_unknown` on the task.
- `services/taskRunner` — run start settles `runStarted`, stamping
  `in_progress` + the resolved state ref; the legacy `running` projection
  is already on the row from `reserveRun`.

Two semantics changed where old behavior conflicted with the table:

- A successful run on a task with no review gate completes to `done`
  instead of parking at `paused` (default-pause removed).
- A verify-bound automation task re-arms `scheduled` while its verdict is
  pending, so heartbeat cadence survives; non-automation tasks hold for the
  verdict.
