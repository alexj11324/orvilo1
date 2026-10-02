# Dispatch resilience sweeps and backlog intake

Closes the orphaned-dispatch gaps in the watchdog chain so every live
`task_dispatches` row has a driver and every retry loop converges. All work
runs inside the existing 5-minute watchdog; no new cron entries.

## Sweep order (handler `task/handlers/watchdog.ts`)

starts → recovery → ownership → **resume** → cancellations → runTaskWatchdog →
**intake** → event sweeps. Resume runs before the cancellation sweep so a
freshly fenced intent is interrupted in the same pass; intake runs last so it
only sees the post-sweep steady state.

## `taskDispatchResume` — re-driver for stranded intents

- `findStaleStartCandidates`: `requested`/`claimed` rows whose `updatedAt` is
  older than 5 min with a null/expired lease. These pin the task's single
  active slot while nobody owns them.
- `findWaitingResumeCandidates`: `waiting` rows with the same staleness,
  excluding reasons that only an external event can lift (`goal_*`,
  `superseded_*`, `settlement_*`, `planning_resume_instruction_missing`) and
  triggers a sweep cannot replay (`event:*`, `orchestrator:planning:*` — the
  planning sweep owns those).
- Each candidate is marked via `claimForResume` (CAS on phase,
  `recovery_attempts + 1`, stale lease cleared — deliberately no fresh
  lease, which would block the re-drive's own `claimForProvisioning`) and
  re-driven through
  `TaskRunnerService.runTask` with the row's **stored** `idempotencyKey` and
  the trigger parsed from `requestedBy`. `runTask`'s `existing` path resumes
  waiting rows or re-enters provisioning for stranded starts; goal/paused
  gates re-evaluate inside `request`.
- Bounds: `recoveryAttempts >= 20` or an un-re-drivable trigger →
  `requestStop` (fenced `cancel_requested`, drained by the bounded
  cancellation sweep). Transient `runTask` errors release the lease for the
  next pass; `TaskDispatchConflictError`/`TaskDispatchWaitingError` are
  benign outcomes, not failures.

## Recovery reconcile bound (`taskDispatchRecovery`)

`recovery_attempts` also bounds the `outcome_unknown` reconcile: releasing a
claim as `outcome_unknown` increments the counter, while a release that finds
a stable live identity resets it to 0. At `recoveryAttempts >= 60` the sweep
calls `abandonRecovery`, which settles the dispatch `abandoned` under
fence+generation CAS (fence bumped so late writes are rejected), parks the
task `paused` with an error, and emits the LinearSync cancel event — the slot
frees instead of retrying forever every 30s.

## Watchdog unconfirmed-cancel bound (`taskWatchdog`)

- Running topics carrying `dispatchId`/`dispatchFence`/`executionGeneration`
  hand cancellation to the bounded dispatch cancel sweep via `requestStop`
  (`watchdog_heartbeat_timeout`) — no task-level accounting needed.
- Dispatch-less topics (legacy rows) bump
  `task.context.watchdogCancel.unconfirmedAttempts`; at 3 the task parks
  `paused` with an urgent brief instead of looping silently.

## `taskBacklogIntake` — autoDispatch pull

Opt-in per project via `orchestrationPolicy.autoDispatch`. Eligible tasks:
`status='backlog'`, workspace-scoped, `assigneeAgentId` set, no
`automationMode` (heartbeat/schedule own their cadence), not deleted, and —
checked under a NOT EXISTS against all eight active phases — no live
dispatch. Dependencies must be complete (`areAllDependenciesCompleted`).
Starts use `trigger='orchestrator'` with idempotency key
`backlog-intake:task:{id}:generation:{executionGeneration+1}` so a burned
intent rekeys on the next generation rather than jamming permanently.
`waiting` outcomes are the resume sweep's job; conflicts are benign.

## Column

`task_dispatches.recovery_attempts` (int, default 0) — shared counter for
resume claims and outcome_unknown reschedules; reset on waiting-resume and on
a reconcile that finds a stable live identity.

## Orphan live-lock guard (`taskDispatchRecovery`)

A reconcile that finds a persisted `running` operation must still prove the
executor is alive: `touchRunning` refreshes `agent_operations.updatedAt` per
execution step, so a row stale beyond the operation lease window
(`DEFAULT_STALE_OPERATION_MS`, 5m — same convention as `settleStaleRunning`)
is a dead executor's signature, not a live one. Stale `running` ops release
back to `outcome_unknown` (a counted attempt toward `MAX_RECOVERY_ATTEMPTS`)
instead of `running` + heartbeat re-arm — otherwise every pass resets
`recovery_attempts` and re-arms the heartbeat, pinning the task's active
dispatch slot forever. `waiting_*` statuses park legitimately quiet and are
exempt; they converge through `AbandonOperationService`.

## Admission contention translation (`taskDispatch`)

Postgres lock-kills (`40P01`) and serialization failures (`40001`) on the
single-active-dispatch path — `request`, `claimForProvisioning`,
`transition` — are translated into `TaskDispatchConflictError` (same outcome
class as the `busy` branch, TRPC `CONFLICT` upstream) rather than escaping as
raw driver errors, so callers retry idempotently instead of seeing 500-class
failures.
