import type { TaskWorkflowCategory } from '@orvilo/types';

/**
 * The only category whose move spawns a builder: In Progress. In Review is
 * deliberate — moving a task into review never starts a run (verification is
 * Verify's job); moving out of review back to In Progress may re-run.
 */
const AUTO_RUN_CATEGORIES = new Set<TaskWorkflowCategory>(['in_progress']);

export const shouldAutoRunForWorkflowMove = (input: {
  automationMode?: string | null;
  blocked?: boolean;
  nextCategory: TaskWorkflowCategory;
  previousCategory?: TaskWorkflowCategory | null;
  status?: string | null;
}): boolean => {
  if (!AUTO_RUN_CATEGORIES.has(input.nextCategory)) return false;
  if (input.previousCategory === input.nextCategory) return false;
  if (input.status === 'running' || input.status === 'scheduled') return false;
  if (input.blocked) return false;
  if (input.automationMode) return false;
  return true;
};
