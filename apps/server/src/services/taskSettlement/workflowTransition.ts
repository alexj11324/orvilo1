import type { TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';

import { resolveWorkflowMove } from '@/database/models/workflowMove';

/** Workflow columns a settle may write alongside the legacy status. */
export interface TaskWorkflowPatch {
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
  workflowStateRefId?: string | null;
}

export interface WorkflowTransition {
  ambiguous: boolean;
  patch: TaskWorkflowPatch;
}

/**
 * Resolve a settlement workflow target onto the team's `team_workflow_states`
 * — the same `resolveWorkflowMove` resolution the board move uses, including
 * the multi-state ambiguity rule: when several states share the target
 * category, settlement lands the bare category and clears the stale state
 * pointers (it never guesses a position), flagging the write `ambiguous` so
 * readers can ask a human to pick the exact state.
 */
export const resolveWorkflowTransition = (params: {
  category: TaskWorkflowCategory;
  states: Pick<TeamWorkflowStateItem, 'category' | 'id' | 'remoteStateId'>[];
}): WorkflowTransition => {
  const resolved = resolveWorkflowMove({
    category: params.category,
    states: params.states,
  });
  if (resolved.type === 'exact') {
    return {
      ambiguous: false,
      patch: {
        workflowCategory: resolved.workflowCategory,
        workflowStateId: resolved.workflowStateId,
        workflowStateRefId: resolved.workflowStateRefId,
      },
    };
  }
  // 'category' (no state for the category) / 'required' (ambiguous) /
  // 'invalid' (unreachable — settlement never passes a ref) → category only.
  return {
    ambiguous: resolved.type === 'required',
    patch: {
      workflowCategory: params.category,
      workflowStateId: null,
      workflowStateRefId: null,
    },
  };
};
