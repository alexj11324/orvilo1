import type { TaskAttentionReason, TaskExecutionState, TaskItem } from '@orvilo/types';
import { executionParkedReason } from '@orvilo/types';

import type { VerifySettlementOutcome } from './types';

/**
 * Attention reason attached to a verify-routed review hold. Mirrors the
 * settlement policy's mapping — kept here so read surfaces and the policy
 * cannot drift apart.
 */
export const attentionForVerifyOutcome = (
  outcome: VerifySettlementOutcome,
): TaskAttentionReason => {
  switch (outcome) {
    case 'failed': {
      return 'needs_changes';
    }
    case 'aegis_evidence_required': {
      return 'review_required';
    }
    default: {
      // errored / review_errored / unjudgeable / integration_blocked
      return 'blocked';
    }
  }
};

/**
 * Derive the canonical attention reason for a task from its persisted layers.
 * Attention is never stored — it is always computed like this, by the
 * settlement service (when settling) and by read surfaces (when displaying).
 *
 * - execution `waiting` → `needs_input`
 * - execution `failed` / `outcome_unknown` → `execution_failed` /
 *   `outcome_unknown`
 * - explicit parked review reason → retain review attention in any category
 * - workflow `in_review` → the verify outcome when known, else
 *   `review_required`
 * - anything else → `none`
 */
export const deriveTaskAttention = (input: {
  execution: TaskExecutionState | null;
  task: Pick<TaskItem, 'workflowCategory'> & Partial<Pick<TaskItem, 'context'>>;
  verifyOutcome?: VerifySettlementOutcome;
}): TaskAttentionReason => {
  const { execution, task, verifyOutcome } = input;
  const parkedReason = executionParkedReason(task.context);
  if (parkedReason === 'needs_input') return 'needs_input';
  switch (execution) {
    case 'waiting': {
      return 'needs_input';
    }
    case 'failed': {
      return 'execution_failed';
    }
    case 'outcome_unknown': {
      return 'outcome_unknown';
    }
    default: {
      break;
    }
  }
  if (
    parkedReason === 'review_required' ||
    parkedReason === 'needs_changes' ||
    parkedReason === 'blocked'
  ) {
    return parkedReason;
  }
  if (task.workflowCategory === 'in_review') {
    return verifyOutcome ? attentionForVerifyOutcome(verifyOutcome) : 'review_required';
  }
  return 'none';
};
