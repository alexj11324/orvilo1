import type {
  ExecutionOutcome,
  TaskAttentionReason,
  TaskItem,
  TaskWorkflowCategory,
} from '@orvilo/types';
import { isAutomationRunTrigger } from '@orvilo/types';

import type { SettlementContext, SettlementPlan } from './types';

/**
 * Centralized settlement policy — the only place an execution outcome
 * is turned into a task state. The table it implements lives in
 * `docs/development/state-model.md`; the highlights:
 *
 * | event                        | workflow     | execution | attention        | legacy      |
 * | ---------------------------- | ------------ | --------- | ---------------- | ----------- |
 * | run starts                   | in_progress  | running   | none             | running     |
 * | run waits for user           | in_progress  | waiting   | needs_input      | running     |
 * | execution failed             | in_progress  | failed    | execution_failed | paused¹     |
 * | success, no review required  | done         | succeeded | none             | completed   |
 * | success, review required     | in_review    | succeeded | review_required  | paused      |
 * | user cancels issue           | canceled     | canceled  | none             | canceled    |
 *
 * ¹ automation tasks keep their resting `scheduled` state (a fuse blow pauses).
 * Automation tasks keep their resting `scheduled` state unless the run cap
 *   was reached.
 *
 * Invariants the mapping keeps distinct (never collapses one into another):
 * `paused` ≠ in_review, `failed` ≠ needs_input, `succeeded` ≠ done.
 */

/** What the caller already knows — the settle input plus resolved review requirement. */
export interface SettlementPlanContext {
  context?: SettlementContext;
  outcome?: ExecutionOutcome;
  /** Whether a successful run must park for human review. */
  reviewRequired: boolean;
  runStarted?: boolean;
  task: TaskItem;
}

const KEEP_OPEN_WORKFLOW: Readonly<Set<TaskWorkflowCategory>> = new Set([
  'backlog',
  'todo',
  'triage',
  'in_progress',
]);

/** Workflow target for a task whose run is (or just was) in flight. */
const openWorkflowCategory = (current: TaskWorkflowCategory): TaskWorkflowCategory | undefined =>
  KEEP_OPEN_WORKFLOW.has(current) ? 'in_progress' : undefined;

const plan = (p: SettlementPlan): SettlementPlan => p;

/**
 * Whether a successful run parks the task in `in_review` or completes
 * straight to `done` — the explicit-gates-only replacement for the retired
 * default-pause. `true` when any of:
 *
 * - the task's checkpoint requires review (`checkpoint.topic.after`),
 * - the owning project's `orchestrationPolicy.requireHumanReview` is `true`,
 *
 * Project policy is resolved by the caller —
 * this function is synchronous so the model layer can reuse it.
 */
export const resolveTaskReviewRequirement = (
  task: Pick<TaskItem, 'config'>,
  options?: {
    projectRequireHumanReview?: boolean;
  },
): boolean => {
  if (options?.projectRequireHumanReview === true) return true;
  const checkpoint =
    ((task.config as Record<string, unknown> | undefined)?.checkpoint as
      { topic?: { after?: boolean } } | undefined) ?? {};
  if (checkpoint.topic?.after) return true;
  return false;
};

/** Resolve the settlement plan for one settle event. Pure — no I/O. */
export const resolveSettlementPlan = ({
  context,
  outcome,
  reviewRequired,
  runStarted,
  task,
}: SettlementPlanContext): SettlementPlan => {
  const isAutomation = Boolean(task.automationMode);
  const isAutomationTick =
    !context?.manualAutomationRun && isAutomationRunTrigger(context?.runTrigger);
  const workflowAfterRun = openWorkflowCategory(task.workflowCategory);

  // Issue-level cancel: the whole issue closes — the active run is canceled by
  // the caller before this settle lands.
  if (context?.issueCancel) {
    return plan({
      attention: 'none',
      decision: { type: 'complete' },
      execution: 'canceled',
      legacyStatus: 'canceled',
      workflowCategory: 'canceled',
    });
  }

  // Run-start: the issue is open and executing.
  if (runStarted) {
    return plan({
      attention: 'none',
      decision: { type: 'keep_open' },
      execution: 'running',
      legacyStatus: 'running',
      workflowCategory: 'in_progress',
    });
  }

  if (context?.unresolvedInput) {
    return plan({
      attention: 'needs_input',
      decision: { type: 'keep_open', attention: 'needs_input' },
      execution: 'failed',
      legacyStatus: 'paused',
      workflowCategory: task.workflowCategory === 'done' ? 'todo' : task.workflowCategory,
    });
  }

  // ── Run-driven settles ──
  switch (outcome) {
    case 'waiting_for_input': {
      return plan({
        attention: 'needs_input',
        decision: { type: 'keep_open', attention: 'needs_input' },
        execution: 'waiting',
        legacyStatus: 'running',
        workflowCategory: 'in_progress',
      });
    }
    case 'canceled': {
      // Run-level cancel: the issue stays open; nothing else to write.
      return plan({
        attention: 'none',
        decision: { type: 'hold' },
        execution: 'canceled',
      });
    }
    case 'failed':
    case 'outcome_unknown': {
      const attention: TaskAttentionReason =
        outcome === 'failed' ? 'execution_failed' : 'outcome_unknown';
      if (isAutomation) {
        const paused = isAutomationTick && context?.automationFuseBlown;
        return plan({
          attention,
          decision: { type: 'keep_open', attention },
          execution: outcome === 'failed' ? 'failed' : 'outcome_unknown',
          legacyStatus: paused ? 'paused' : 'scheduled',
          workflowCategory: workflowAfterRun,
        });
      }
      return plan({
        attention,
        decision: { type: 'keep_open', attention },
        execution: outcome === 'failed' ? 'failed' : 'outcome_unknown',
        legacyStatus: 'paused',
        workflowCategory: workflowAfterRun,
      });
    }
    case 'succeeded': {
      // Something outside execution still has to land before the task may
      // settle — gate holds it for a human.
      if (context?.blocked) {
        return plan({
          attention: 'blocked',
          decision: { type: 'keep_open', attention: 'blocked' },
          execution: 'succeeded',
          legacyStatus: 'paused',
          workflowCategory: workflowAfterRun,
        });
      }
      if (isAutomation) {
        if (task.automationMode === 'schedule' && context?.scheduleCapReached) {
          return plan({
            attention: 'none',
            decision: { type: 'complete' },
            execution: 'succeeded',
            legacyStatus: 'completed',
            workflowCategory: 'done',
          });
        }
        return plan({
          attention: 'none',
          decision: { type: 'keep_open' },
          execution: 'succeeded',
          legacyStatus: 'scheduled',
          workflowCategory: workflowAfterRun,
        });
      }
      if (reviewRequired) {
        return plan({
          attention: 'review_required',
          decision: { type: 'review' },
          execution: 'succeeded',
          legacyStatus: 'paused',
          workflowCategory: 'in_review',
        });
      }
      return plan({
        attention: 'none',
        decision: { type: 'complete' },
        execution: 'succeeded',
        legacyStatus: 'completed',
        workflowCategory: 'done',
      });
    }
    default: {
      return plan({
        attention: 'none',
        decision: { type: 'hold' },
        execution: null,
      });
    }
  }
};
