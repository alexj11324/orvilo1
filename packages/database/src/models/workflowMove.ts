import type { TaskStatus, TaskWorkflowCategory, TeamWorkflowStateItem } from '@orvilo/types';

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

export type WorkflowCreatePresetPatch = {
  triageStatus?: 'accepted';
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
  workflowStateRefId?: string | null;
};

/**
 * Create-time counterpart of {@link resolveWorkflowMove}: a board column's `+`
 * preset lands the new issue inside that column's dimension. A category with
 * exactly one mapped team state stamps it; zero or ambiguous matches keep the
 * category only — a create has no state picker to disambiguate with, and the
 * board groups on the category either way.
 *
 * Landing directly on a board column also means the issue never passes
 * through intake: a non-Triage preset (or a status preset on a status board)
 * resolves `triageStatus: 'accepted'`, while a Triage-column create and a
 * create with no preset at all keep the model's own default (`untriaged`
 * for team tasks, NULL otherwise).
 */
export const resolveWorkflowCreatePreset = (params: {
  category?: TaskWorkflowCategory;
  states: WorkflowMoveState[];
  status?: TaskStatus;
  teamId?: string;
}): WorkflowCreatePresetPatch => {
  const patch: WorkflowCreatePresetPatch = {};

  if (params.category !== undefined) {
    const resolved = resolveWorkflowMove({ category: params.category, states: params.states });
    if (resolved.type === 'exact') {
      patch.workflowCategory = resolved.workflowCategory;
      patch.workflowStateId = resolved.workflowStateId;
      patch.workflowStateRefId = resolved.workflowStateRefId;
    } else {
      // 'category' (no states configured) and 'required' (ambiguous) both fall
      // back to the bare category — never lowest-position guess.
      patch.workflowCategory = params.category;
    }
  }

  const placedOnBoard = params.category !== undefined || params.status !== undefined;
  if (params.teamId && placedOnBoard && params.category !== 'triage') {
    patch.triageStatus = 'accepted';
  }

  return patch;
};
