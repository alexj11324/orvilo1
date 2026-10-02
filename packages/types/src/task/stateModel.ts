import type { TaskDispatchPhase, TaskRunState, TaskStatus } from './index';

/**
 * Canonical task state model — three layers, one settlement policy.
 *
 * - **Issue Workflow** (the user-facing "Status"): `tasks.workflowCategory` +
 *   `tasks.workflowStateRefId` are the sole source of truth. Categories:
 *   triage / backlog / todo / in_progress / in_review / done / canceled.
 * - **Execution** (the agent-run truth): `task_dispatches.phase` +
 *   `task_topics.run_state`. This module's {@link TaskExecutionState} is the
 *   canonical projection of those rows.
 * - **Attention** (does this need a human? {@link TaskAttentionReason}):
 *   derived from the other two layers, never edited directly.
 *
 * `tasks.status` is a legacy compatibility projection maintained for old
 * readers — it is NOT the Issue Status and must not be consulted to decide
 * business state. All transitions between the workflow and execution layers
 * happen exclusively through the centralized settlement policy
 * (`apps/server/src/services/taskSettlement`).
 */

/** Canonical execution states projected from `task_dispatches`/`task_topics` rows. */
export const TASK_EXECUTION_STATES = [
  'queued',
  'provisioning',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'canceled',
  'outcome_unknown',
] as const;
export type TaskExecutionState = (typeof TASK_EXECUTION_STATES)[number];

/**
 * Canonical attention reasons — the "needs a human" layer.
 *
 * - `none` — nothing required.
 * - `needs_input` — the run is waiting on the user (or on policy/action only a
 *   human can provide, e.g. assigning an agent).
 * - `review_required` — execution succeeded; review is required by policy.
 * - `execution_failed` — the run failed or was lost.
 * - `blocked` — external gate blocked (integration, evidence, admission).
 * - `outcome_unknown` — the last outcome could not be established.
 * - `needs_changes` — verification failed; another attempt is required.
 */
export const TASK_ATTENTION_REASONS = [
  'none',
  'needs_input',
  'review_required',
  'execution_failed',
  'blocked',
  'outcome_unknown',
  'needs_changes',
] as const;
export type TaskAttentionReason = (typeof TASK_ATTENTION_REASONS)[number];

/** Outcome of a run/verify event handed to the settlement policy. */
export const EXECUTION_OUTCOMES = [
  'succeeded',
  'failed',
  'waiting_for_input',
  'canceled',
  'outcome_unknown',
] as const;
export type ExecutionOutcome = (typeof EXECUTION_OUTCOMES)[number];

/**
 * What the settlement policy decided for one settle event.
 *
 * - `complete` — the issue is done: workflow → `done`.
 * - `review` — succeeded but requires human review: workflow → `in_review`.
 * - `keep_open` — issue stays in progress; `attention` carries the reason, if
 *   any (waiting, failed, blocked, …).
 * - `retry` — another attempt is queued (e.g. auto-repair after a failed
 *   verify).
 * - `hold` — no state change: another owner still drives the task (verify
 *   bound, integration gate, stale callback).
 */
export type SettlementDecision =
  | { type: 'complete' }
  | { type: 'review' }
  | { type: 'keep_open'; attention?: TaskAttentionReason }
  | { type: 'retry' }
  | { type: 'hold' };

/**
 * Rank used to merge the dispatch and run rows into one projection: the row
 * reporting the furthest-advanced state wins (a `waiting` run under a still
 * `running` dispatch reports `waiting`). Terminal states share one rank; on a
 * tie the dispatch row — the contract fence — is authoritative.
 */
const EXECUTION_STATE_RANK: Readonly<Record<TaskExecutionState, number>> = {
  canceled: 4,
  failed: 4,
  outcome_unknown: 4,
  provisioning: 1,
  queued: 0,
  running: 2,
  succeeded: 4,
  waiting: 3,
};

const DISPATCH_PHASE_EXECUTION: Readonly<Record<TaskDispatchPhase, TaskExecutionState>> = {
  abandoned: 'outcome_unknown',
  cancel_requested: 'running',
  canceled: 'canceled',
  claimed: 'queued',
  dispatched: 'running',
  failed: 'failed',
  outcome_unknown: 'outcome_unknown',
  provisioning: 'provisioning',
  requested: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  waiting: 'waiting',
};

const RUN_STATE_EXECUTION: Readonly<Record<TaskRunState, TaskExecutionState>> = {
  cancel_requested: 'running',
  canceled: 'canceled',
  failed: 'failed',
  outcome_unknown: 'outcome_unknown',
  provisioning: 'provisioning',
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  waiting: 'waiting',
};

/** Legacy `tasks.status` fallback — used only when no execution rows exist. */
const LEGACY_STATUS_EXECUTION: Readonly<Partial<Record<TaskStatus, TaskExecutionState>>> = {
  canceled: 'canceled',
  completed: 'succeeded',
  failed: 'failed',
  paused: 'outcome_unknown',
  running: 'running',
};

export interface TaskExecutionProjectionInput {
  /**
   * `task_dispatches.phase` of the task's active or latest dispatch, if any.
   * The dispatch row is the contract fence: once terminal it is authoritative
   * over a stale run row.
   */
  dispatchPhase?: TaskDispatchPhase | null;
  /**
   * Legacy `tasks.status`, consulted only when neither execution row exists
   * (pre-contract rows). `backlog`/`scheduled` have no execution to project.
   */
  legacyStatus?: TaskStatus | string | null;
  /** `task_topics.run_state` of the task's active or latest run, if any. */
  runState?: TaskRunState | null;
}

/**
 * Project the canonical {@link TaskExecutionState} for a task from its
 * dispatch/run rows — the single function settlement and read surfaces call.
 * Returns `null` when the task has no execution to project (never ran).
 */
export const deriveTaskExecutionState = ({
  dispatchPhase,
  legacyStatus,
  runState,
}: TaskExecutionProjectionInput): TaskExecutionState | null => {
  const fromDispatch = dispatchPhase ? DISPATCH_PHASE_EXECUTION[dispatchPhase] : undefined;
  const fromRun = runState ? RUN_STATE_EXECUTION[runState] : undefined;

  if (fromDispatch && fromRun) {
    return EXECUTION_STATE_RANK[fromDispatch] >= EXECUTION_STATE_RANK[fromRun]
      ? fromDispatch
      : fromRun;
  }
  if (fromDispatch) return fromDispatch;
  if (fromRun) return fromRun;

  return legacyStatus ? (LEGACY_STATUS_EXECUTION[legacyStatus as TaskStatus] ?? null) : null;
};
