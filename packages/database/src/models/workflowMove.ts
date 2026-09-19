import type { TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';

export type WorkflowMoveState = Pick<TeamWorkflowStateItem, 'category' | 'id' | 'remoteStateId'>;

export type WorkflowMoveResolution =
  | { type: 'category'; workflowCategory: TaskWorkflowCategory }
  | { type: 'invalid' }
  | { type: 'required' }
  | {
      type: 'exact';
      workflowCategory: TaskWorkflowCategory;
      workflowStateId: string | null;
      workflowStateRefId: string;
    };

const toExact = (
  category: TaskWorkflowCategory,
  state: WorkflowMoveState,
): Extract<WorkflowMoveResolution, { type: 'exact' }> => ({
  type: 'exact',
  workflowCategory: category,
  workflowStateId: state.remoteStateId,
  workflowStateRefId: state.id,
});

/**
 * Resolve a workflow-category board drop onto zero, one, or many team states.
 * N>1 without an explicit row is `required` — never lowest-position guess.
 */
export const resolveWorkflowMove = (params: {
  category: TaskWorkflowCategory;
  states: WorkflowMoveState[];
  targetWorkflowStateRefId?: string;
}): WorkflowMoveResolution => {
  const matches = params.states.filter((state) => state.category === params.category);
  if (params.targetWorkflowStateRefId) {
    const selected = matches.find((state) => state.id === params.targetWorkflowStateRefId);
    return selected ? toExact(params.category, selected) : { type: 'invalid' };
  }
  if (matches.length === 0) return { type: 'category', workflowCategory: params.category };
  if (matches.length === 1) return toExact(params.category, matches[0]);
  return { type: 'required' };
};
