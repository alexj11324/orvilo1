import type {
  ExecutionOutcome,
  TaskAttentionReason,
  TaskItem,
  TaskVerifyConfig,
} from '@orvilo/types';
import { isAutomationRunTrigger } from '@orvilo/types';

import type { SettlementContext, SettlementPlan, VerifySettlementOutcome } from './types';

/**
 * Centralized settlement policy — the only place an execution/verify outcome
 * is turned into a task state. The table it implements lives in
 * `docs/development/state-model.md`; the highlights:
 *
 * | event                        | workflow     | execution | attention        | legacy      |
 * | ---------------------------- | ------------ | --------- | ---------------- | ----------- |
 * | run starts                   | in_progress  | running   | none             | running     |
 * | run waits for user           | unchanged    | waiting   | needs_input      | running     |
 * | execution failed             | unchanged    | failed    | execution_failed | paused¹     |
 * | success, no review required  | done         | succeeded | none             | completed   |
 * | success, review required     | unchanged    | succeeded | review_required  | paused      |
 * | verify passed                | done         | succeeded | none             | completed²  |
 * | verify failed + auto repair  | unchanged    | queued    | needs_changes    | running     |
 * | verify failed, no repair     | unchanged    | succeeded | needs_changes    | paused      |
 * | user cancels issue           | canceled     | canceled  | none             | canceled    |
 *
 * ¹ automation tasks keep their resting `scheduled` state (a fuse blow pauses).
 * ² automation tasks keep their resting `scheduled` state unless the run cap
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
  verifyOutcome?: VerifySettlementOutcome;
}

const plan = (p: SettlementPlan): SettlementPlan => p;

/**
 * Whether a successful run parks for human review or completes
 * straight to `done` — the explicit-gates-only replacement for the retired
 * default-pause. `true` when any of:
 *
 * - the task's checkpoint requires review (`checkpoint.topic.after`),
 * - the owning project's `orchestrationPolicy.requireHumanReview` is `true`,
 * - an explicit verify gate is enabled on the (ancestor-resolved) config.
 *
 * Project policy and the resolved verify config are resolved by the caller —
 * this function is synchronous so the model layer can reuse it.
 */
export const resolveTaskReviewRequirement = (
  task: Pick<TaskItem, 'config'>,
  options?: {
    projectRequireHumanReview?: boolean;
    verifyConfig?: TaskVerifyConfig | null;
  },
): boolean => {
  if (options?.projectRequireHumanReview === true) return true;
  const checkpoint =
    ((task.config as Record<string, unknown> | undefined)?.checkpoint as
      { topic?: { after?: boolean } } | undefined) ?? {};
  if (checkpoint.topic?.after) return true;
  return options?.verifyConfig?.enabled === true;
};

/** Map the non-pass verify outcomes to their attention reason. */
const verifyAttention = (outcome: VerifySettlementOutcome): TaskAttentionReason => {
  switch (outcome) {
    case 'failed': {
      return 'needs_changes';
    }
    case 'aegis_evidence_required': {
      return 'review_required';
    }
    default: {
      // errored / review_errored / unjudgeable / integration_blocked — an
      // external gate could not evaluate or publish the delivery.
      return 'blocked';
    }
  }
};

/** Resolve the settlement plan for one settle event. Pure — no I/O. */
export const resolveSettlementPlan = ({
  context,
  outcome,
  reviewRequired,
  runStarted,
  task,
  verifyOutcome,
}: SettlementPlanContext): SettlementPlan => {
  const isAutomation = Boolean(task.automationMode);
  const isAutomationTick =
    !context?.manualAutomationRun && isAutomationRunTrigger(context?.runTrigger);
  const workflowAfterRun = task.workflowCategory;

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
      workflowCategory: task.workflowCategory === 'in_review' ? 'in_review' : 'in_progress',
    });
  }

  if (context?.unresolvedInput) {
    return plan({
      attention: 'needs_input',
      decision: { type: 'keep_open', attention: 'needs_input' },
      execution: 'failed',
      legacyStatus: 'paused',
      workflowCategory: workflowAfterRun === 'done' ? 'todo' : workflowAfterRun,
    });
  }

  // ── Verify-driven settles ──
  if (verifyOutcome) {
    if (verifyOutcome === 'passed') {
      if (isAutomation && !context?.scheduleCapReached) {
        return plan({
          attention: 'none',
          decision: { type: 'keep_open' },
          execution: 'succeeded',
          legacyStatus: 'scheduled',
          workflowCategory: workflowAfterRun,
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
    if (verifyOutcome === 'failed' && context?.repairSpawned) {
      return plan({
        attention: 'needs_changes',
        decision: { type: 'retry' },
        execution: 'queued',
        legacyStatus: 'running',
        workflowCategory: workflowAfterRun,
      });
    }
    // Non-pass outcomes route the task to a person (verify judges the run,
    // not the lifetime schedule — recurring tasks keep their cadence).
    if (isAutomation) {
      return plan({
        attention: verifyAttention(verifyOutcome),
        decision: { type: 'keep_open', attention: verifyAttention(verifyOutcome) },
        execution: 'succeeded',
        legacyStatus: 'scheduled',
        workflowCategory: workflowAfterRun,
      });
    }
    return plan({
      attention: verifyAttention(verifyOutcome),
      decision: { type: 'review' },
      execution: 'succeeded',
      legacyStatus: 'paused',
      workflowCategory: workflowAfterRun,
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
        workflowCategory: workflowAfterRun,
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
      // A confirmed verify plan owns delivery acceptance — verify's settle
      // drives this task; the run callback must not advance it. An automation
      // task still re-arms to its resting 'scheduled' state (the cadence
      // survives the pending verdict), while a non-automation task holds its
      // current status until Verify lands.
      if (context?.verifyBound) {
        if (isAutomation) {
          return plan({
            attention: 'none',
            decision: { type: 'keep_open' },
            execution: 'succeeded',
            legacyStatus: 'scheduled',
            workflowCategory: workflowAfterRun,
          });
        }
        return plan({
          attention: 'none',
          decision: { type: 'hold' },
          execution: 'succeeded',
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
          workflowCategory: workflowAfterRun,
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
