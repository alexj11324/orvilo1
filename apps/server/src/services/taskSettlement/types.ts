import type {
  ExecutionOutcome,
  SettlementDecision,
  TaskAttentionReason,
  TaskExecutionState,
  TaskItem,
  TaskRunTrigger,
  TaskStatus,
  TaskWorkflowCategory,
} from '@orvilo/types';

import type { OrviloDatabase } from '@/database/type';

/**
 * Terminal verify verdicts the settlement policy accepts. Mirrors the outcome
 * chain computed inside `driveTaskFromVerify` — the run status itself
 * (`passed`/`failed`/`errored`) plus the downgrades applied on top of it
 * (goal review, aegis evidence gate, workspace integration).
 */
export type VerifySettlementOutcome =
  | 'passed'
  | 'failed'
  | 'errored'
  | 'review_errored'
  | 'unjudgeable'
  | 'aegis_evidence_required'
  | 'integration_blocked';

/** Execution-contract expectation reused from the verify/dispatch CAS writes. */
export interface SettlementExpectedContract {
  assigneeAgentId: string | null;
  executionGeneration: number;
  policyRevision: number;
  requirementRevision: number;
  runReservationId?: string;
  status?: string;
}

/**
 * Caller-side knowledge the policy cannot read off the task row: what the
 * caller just observed (verify bound, fuse state), and which concurrency
 * guard the apply step must use.
 */
export interface SettlementContext {
  /** The automation failure fuse blew on this failure. */
  automationFuseBlown?: boolean;
  /** Pre-commit hook forwarded to the task-service write (`beforeMutation`). */
  beforeMutation?: (tx: OrviloDatabase) => Promise<boolean>;
  /**
   * The delivery is gated on something outside execution (remote identity
   * capture, verify-state read, workspace integration, upstream dependency
   * change). Routes the task to a human instead of settling normally.
   */
  blocked?: boolean;
  /** Clear the run-reservation lease columns with this write. */
  clearRunReservation?: boolean;
  /** The agent asked to complete its own task from this operation. */
  completionRequestedByOperation?: boolean;
  /** Error the run settled with — written to the legacy `error` column. */
  error?: string | null;
  /** Immutable dispatch contract the verdict belongs to. */
  expectedContract?: SettlementExpectedContract;
  /** Status the task is expected to still hold (CAS precondition). */
  expectedStatus?: string;
  /** Whether the user canceled the issue itself (not just the run). */
  issueCancel?: boolean;
  /** A manual "run now" on an automation task — not an automation-health signal. */
  manualAutomationRun?: boolean;

  /** Post-commit hook forwarded to the task-service write. */
  onStatusCommitted?: () => void;
  /** A verify failure spawned a repair run instead of settling. */
  repairSpawned?: boolean;
  // ── Write guards — the settle applies through exactly one. ──
  /** Active `completion:*`/run reservation the caller claimed. */
  reservationId?: string;
  /** How the run was kicked off — decides automation resting states. */
  runTrigger?: TaskRunTrigger;
  /** Schedule-mode task consumed its final allowed run. */
  scheduleCapReached?: boolean;
  /**
   * Write the legacy status + workflow patch through `TaskService.updateStatus`
   * so its cascades (subtask rollup, downstream unlock, worktree cleanup,
   * schedule/heartbeat bookkeeping) still run. Used for `complete` outcomes.
   */
  throughTaskService?: boolean;
  /** A confirmed verify plan owns this run's delivery acceptance. */
  verifyBound?: boolean;
}

export interface SettleTaskExecutionInput {
  context?: SettlementContext;
  /** Dispatch fence accompanying the generation, when known. */
  dispatchFence?: number;
  /** Run-contract generation the outcome belongs to — stale callbacks no-op. */
  executionGeneration?: number;
  /** The agent operation this settle event came from, when there is one. */
  operationId?: string;
  /** Execution outcome being settled. Omit for a run-start settle. */
  outcome?: ExecutionOutcome;
  /** Run-start settle: stamp the running projection + In Progress workflow. */
  runStarted?: boolean;
  taskId: string;
  /** Terminal verify verdict when the settle is verify-driven. */
  verifyOutcome?: VerifySettlementOutcome;
}

/** The full plan the policy produced — the same shape apply consumes. */
export interface SettlementPlan {
  attention: TaskAttentionReason;
  decision: SettlementDecision;
  /** Canonical execution state after this settle. */
  execution: TaskExecutionState | null;
  /** Legacy `tasks.status` projection to write — absent = leave unchanged. */
  legacyStatus?: TaskStatus;
  /** Target workflow category — absent = leave unchanged. */
  workflowCategory?: TaskWorkflowCategory;
}

export type SettlementSkippedReason =
  /** No mutable task row was found (deleted or never existed). */
  | 'no_task'
  /** Task already sits in a terminal legacy status. */
  | 'terminal'
  /** `executionGeneration`/`dispatchFence` did not match — late callback. */
  | 'stale_generation'
  /** Policy said `hold` — another owner still drives the task. */
  | 'hold'
  /** Plan produced nothing new to write. */
  | 'unchanged';

export interface SettlementResult {
  /** Whether the task row write was actually applied. */
  applied: boolean;
  attention: TaskAttentionReason;
  decision: SettlementDecision;
  execution: TaskExecutionState | null;
  /** Legacy status written (or kept), for callers that still read it. */
  legacyStatus?: TaskStatus;
  skippedReason?: SettlementSkippedReason;
  /** The task row after the write (when applied). */
  task?: TaskItem;
  /** When the workflow write could only land at category granularity. */
  workflowAmbiguous?: boolean;
  workflowCategory?: TaskWorkflowCategory;
}
