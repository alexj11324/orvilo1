import type { TaskAttentionReason, TaskExecutionState, TaskItem } from '@orvilo/types';

/**
 * Derive the canonical attention reason for a task from its persisted layers.
 * Attention is never stored — it is always computed like this, by the
 * settlement service (when settling) and by read surfaces (when displaying).
 *
 * - execution `waiting` → `needs_input`
 * - execution `failed` / `outcome_unknown` → `execution_failed` /
 *   `outcome_unknown`
 * - workflow `in_review` → `review_required`
 * - anything else → `none`
 */
export const deriveTaskAttention = (input: {
  execution: TaskExecutionState | null;
  task: Pick<TaskItem, 'workflowCategory'>;
}): TaskAttentionReason => {
  const { execution, task } = input;
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
  if (task.workflowCategory === 'in_review') {
    return 'review_required';
  }
  return 'none';
};
