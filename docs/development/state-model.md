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

`tasks.status` is **retired**. The column still exists for historical rows,
but no code path reads it to decide business state and nothing writes new
truth to it — a stale or wrong value cannot change Issue Status, execution
routing, or kanban placement. See [Retired `tasks.status`](#retired-tasksstatus)
below.

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
- The TS-side `legacyStatus` input is consulted only when no execution rows
  exist — a last-resort read for pre-contract historical rows. The SQL
  `taskExecutionStateExpr` (WorkQuery filters) does not consult it: a stored
  filter can never resurrect a stale column value.
- `backlog`/`scheduled` project `null` (no execution to project).

## Settlement policy

Execution outcomes are reported to `settleTaskExecution`, which preserves the
current generation and dispatch fences. Ordinary Issue delivery enters review;
`services/task/review.ts` records a reviewer verdict and normal comment atomically
through the current Issue review cycle. See [Issue review](issue-review.md).

| Event                                  | Issue workflow | Execution / follow-up                                       |
| -------------------------------------- | -------------- | ----------------------------------------------------------- |
| Run starts                             | In progress    | Running                                                     |
| Run waits for user                     | In progress    | Waiting                                                     |
| Execution fails                        | In progress    | Failed; readable activity                                   |
| Delivery has no reviewer Agent         | In progress    | Orchestrator names one; delivery waits                      |
| Delivery has a reviewer Agent          | In review      | Fresh reviewer session                                      |
| Reviewer passes                        | Done           | Optional normal reviewer comment                            |
| Reviewer fails                         | In progress    | Reviewer comment and automatic assignee repair              |
| Reviewer fails three consecutive times | In progress    | Repair stops; one stop comment and owner Inbox notification |
| Reviewer has no verdict                | In review      | Plain waiting activity; ordinary reconnect/sweep retry      |
| Person changes status                  | Chosen status  | Current review cycle is fenced from late callbacks          |
| Person cancels Issue                   | Canceled       | Cancel active run                                           |

Recurring automation keeps its existing scheduled cadence and run-cap policy.
The legacy status field on API responses is a projection of these canonical
layers; it does not own Issue status.

Invariants the policy enforces:

- `paused` is **not** In Review — the legacy projection can say `paused` for
  several attention reasons (review_required, execution_failed, blocked,
  needs_changes); workflow `in_review` is a distinct column write.
- `failed` execution is **not** `needs_input` attention — a failed run wants
  `execution_failed`; `needs_input` is reserved for waits on the user.
- `succeeded` execution is **not** Done — completion is a policy decision
  (the reviewer verdict or a person's status change), not a consequence of the run ending well.

### Review requirement

Ordinary delivered Issues require the reviewer Agent flow. The database requires
`reviewerAgentId` whenever `workflowCategory` is `in_review`, including custom
states in that category. Without a reviewer, delivery stays In progress while
the Orchestrator names one.

The retained `resolveTaskReviewRequirement` helper reads checkpoint and project
policy for automation and other existing callers. It has no Verify/Aegis gate
or inherited verifier configuration.

### Fences and idempotency

- Settlement is fenced by `executionGeneration` / `dispatchFence`: a late
  callback from a superseded run is a no-op.
- Settlement is idempotent: applying the same outcome twice yields the same
  state.
- Workflow writes resolve through `resolveWorkflowMove` — the same
  category → `team_workflow_states` resolution the board move uses, including
  the multi-state ambiguity rule (settlement never guesses a state).

### Dispatch recovery

`taskDispatchRecovery` reconciles `task_dispatches` rows left in
`provisioning`/`dispatched`/`running`/`outcome_unknown` past their lease. Its
decisions key on the **execution's truth** — the `agent_operations` row and its
producers — never on lease freshness alone:

- Operation missing, identity-mismatched, or non-terminal in an unknown state →
  `outcome_unknown` + bounded retry (`MAX_RECOVERY_ATTEMPTS`), then the abandon
  path frees the dispatch slot.
- `running` with a stale `updatedAt` → same bounded retry; a live producer
  (`touchRunning`, generation-fenced) resets the bound because the writer is
  provably alive.
- `waiting_for_async_tool` parks legitimately quiet, so `updatedAt` cannot
  stale it out. The reclaim signal is the awaited producer: a stale park with
  **no live child operation** is an orphaned wait (`operation_orphaned_wait`)
  and enters the bounded path — restoring `running` there would re-arm the
  lease and reset the bound forever, pinning the slot behind a dead run.
- `waiting_for_human` is a legitimate indefinite park (the producer is a
  person) and is never staleness-gated.
- Terminal operation → the row converges through the normal settle path
  (`onTopicComplete` → `settleTaskExecution`), fenced by generation/revision/
  operation identity — never a blind delete.

## Reader guidance

- Issue Status: read `workflowCategory` (+ `workflowStateRefId` for the exact
  team state). Never read `tasks.status` for business state.
- Execution: project `task_dispatches.phase` + `task_topics.run_state`
  through `deriveTaskExecutionState`.
- Attention: derive from the layers above via the settlement service's
  attention module.

## UI surfaces

The client follows the same split:

- **Kanban boards** group only by Issue Status — the seven workflow
  categories (`ISSUE_WORKFLOW_COLUMNS`). `tasks.status`-derived columns, the
  `needsInput` (paused+failed) and `running` (running+scheduled) folds are
  removed from the Issue board. External saved-view boards may still group
  by the legacy execution projection via the `st:`/`wf:` column families
  (`RAW_STATUS_KANBAN_COLUMNS` / `WORKFLOW_KANBAN_COLUMNS`) — the Runs view.
- **`IssueStatusPicker`** is the single Issue-status mutation surface: card
  mark, detail properties, list rows, context-menu submenu and kanban drops
  all commit through one `moveIssueWorkflow` command (CAS `moveBoard` for
  team-linked tasks, `updateTask` otherwise).
- **`TaskExecutionBadge`** renders `deriveTaskExecutionState` read-only —
  it never mutates issue status.
- **Auto-run**: only a move INTO `in_progress` may spawn a builder
  (`AUTO_RUN_CATEGORIES`). Moving into `in_review` starts the reviewer Agent,
  rather than another assignee run.
- **Reviewer ownership** keys off workflow `in_review` (the reviewer
  assigned to the issue/review gate), not the legacy `paused` projection.

## Settlement call sites

Execution delivery writers delegate to `settleTaskExecution`. Reviewer verdicts
use the row-locked Issue review cycle:

- `services/taskLifecycle` — run outcomes (complete / pause / cancel /
  dependency-driven writes) go through the service's `settleOwned` helper,
  which injects `taskId`, `operationId`, and the generation fence. A
  stale-generation skip surfaces as `TaskCompletionSupersededError`.
- `services/task/review` — pass writes Done and the reviewer comment; fail writes
  In progress and the comment, then resumes the assignee after the reviewer
  operation finishes. Three failures stop the repair loop and notify the owner.
- `services/taskIntegration` and `services/taskDeliveryReview` — settled local or
  merged GitHub delivery uses the same fenced execution settlement and review.
- `services/taskWatchdog` — unconfirmed cancel settles `outcome_unknown`;
  heartbeat timeout settles `failed`. The legacy projection for a
  heartbeat timeout is now `paused` (execution-failed keeps the issue open);
  it no longer writes `failed`.
- `services/goal` — the lease-expired reclaim inside the reclaim transaction
  settles `outcome_unknown` on the task.
- `services/taskRunner` — run start settles `runStarted`, stamping
  `in_progress` + the resolved state ref; the legacy `running` projection
  is already on the row from `reserveRun`.

A successful ordinary Issue run cannot complete the Issue by itself. A reviewer
pass or a person's explicit status change owns Done. Recurring automation retains
its existing cadence independently of the removed Acceptance / Verify engine.

## Query and saved-view schema (WorkQuery v2)

`WorkQuery.schemaVersion` is the AST epoch. `1` is the legacy read epoch —
stored v1 predicates on the `status` field meant "whatever `tasks.status`
projected", a mix of both layers. `2` is the write epoch introduced when the
fields split by axis:

| Query field           | Layer it reads                                                                                                                                                           | Surface label           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `workflowCategory`    | Issue Workflow (`workflowStateRefId`/`workflowCategory`)                                                                                                                 | "Status"                |
| `executionState`      | Execution — the `deriveTaskExecutionState` projection of `task_dispatches.phase` / `task_topics.run_state` (NULL when the task never ran; never consults `tasks.status`) | "Execution"             |
| `status` (deprecated) | Retired-vocabulary label, derived from canonical fields via `legacyStatusExpr` / `deriveLegacyTaskStatus` — never the stored column                                      | read-only compatibility |

`normalizeWorkQuery` (types package) migrates a task query's `status`
predicates at read time: unambiguous Issue-Status values
(`backlog`/`completed`/`canceled`) map onto `workflowCategory`,
execution-meaning values (`running`/`paused`/`failed`/`scheduled`) map onto
`executionState`, mixed `in`/`notIn` lists split into an `any`/`all` pair, and
unmigratable members keep the legacy predicate verbatim so old views still
compile. Project queries are untouched — `projects.status` is a real field,
not the legacy projection. The migration is idempotent and never rewrites
the stored row: the server normalizes on `queryTasks`/`queryProjects`/
`countTasks`/`facetTasks` entry, `SavedViewModel` normalizes on
create/update/evaluate/present, and the builder renders whatever a v1
predicate could not express as a preserved, read-only node. A saved view only
becomes v2 when its owner saves — at which point no `status` predicate the
migration could express is ever written again.

Authoring surfaces skip `deprecated` field specs: the filter picker and the
My Work filter directory offer `workflowCategory` as "Status" and
`executionState` as "Execution". Grouping menus follow the same split —
boards group by `workflowCategory` ("Status"); a `status`-grouped column is
the execution axis ("Execution") for old views and is not offered to new
ones.

## Retired `tasks.status`

The column is dead-code-level retired; it remains only to keep historical
rows legible.

- **Writes**: `updateStatus*` still accepts the legacy transition vocabulary
  (`paused`/`running`/`completed`/…) as the API contract, but
  `statusTransitionPatch` translates it — the `status` key never reaches the
  column. `paused`/`failed` transitions stamp the canonical parked marker at
  `context.execution.parked`; every other transition clears it. Terminal
  transitions also land `workflowCategory` (exact state refs arrive via
  `resolveWorkflowMove` at the service layer).
- **Reads**: every decisional read is translated — `predicateForLegacyStatus`
  maps each vocabulary value onto canonical predicates (live dispatch rows,
  parked marker, workflow category, automation arm), `legacyStatusExpr`
  projects the label for display surfaces, and `derivedStatusByIds` answers
  per-task derived maps. No code reads the stored value to decide anything.
- **API surfaces**: response projections that still carry a `status` field
  emit the derived label (subtask trees, dependency entries, recent/brief
  feeds, activity "from" values) — never the frozen column.
- **Backfill**: migration `0201_retire_task_status_parked_backfill` projects
  existing rows' parked state into `context.execution.parked` so historical
  rows derive correctly under the new predicates.
- **Schema drop**: dropping the column is a separate migration decision
  (destructive, needs a compat window for any external consumer). It is
  intentionally not part of the retirement change.
