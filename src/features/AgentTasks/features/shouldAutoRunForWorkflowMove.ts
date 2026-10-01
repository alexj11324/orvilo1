import type { TaskWorkflowCategory } from '@orvilo/types';

/** Stages where the agent should start on its own. A manual Run button is not the trigger. */
const AUTO_RUN_CATEGORIES = new Set<TaskWorkflowCategory>(['in_progress', 'in_review']);

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
