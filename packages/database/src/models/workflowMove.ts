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

export type TriageAction = 'accept' | 'decline' | 'duplicate' | 'reassign';

export type TriageOutcomePatch = {
  workflowCategory?: TaskWorkflowCategory;
  workflowStateId?: string | null;
  workflowStateRefId?: string | null;
};

/**
 * The workflow move a triage action implies (Linear triage semantics):
 *
 * - `decline` and `duplicate` update the issue to a *Canceled* status type —
 *   without this the row just sheds `untriaged` and resurfaces in the team
 *   issues list as ordinary work, which reads as accepted.
 * - `accept`/`reassign` only need a move when the card still sits in the
 *   `triage` lane (created via the Triage column or a triage-mapped imported
 *   state): accepting moves it to the team's default status, and backlog is
 *   the honest default category here — there is no per-team default-status
 *   setting to honor.
 *
 * An unambiguous category match stamps the workflow-state ref too, exactly
 * like {@link resolveWorkflowMove} on a board drop; ambiguous or unconfigured
 * categories land the bare category and never guess a state.
 */
export const resolveTriageOutcome = (params: {
  action: TriageAction;
  states: WorkflowMoveState[];
  workflowCategory?: TaskWorkflowCategory | null;
}): TriageOutcomePatch => {
  const target: TaskWorkflowCategory | undefined =
    params.action === 'decline' || params.action === 'duplicate'
      ? 'canceled'
      : params.workflowCategory === 'triage'
        ? 'backlog'
        : undefined;
  if (!target) return {};

  const resolved = resolveWorkflowMove({ category: target, states: params.states });
  if (resolved.type === 'exact') {
    return {
      workflowCategory: resolved.workflowCategory,
      workflowStateId: resolved.workflowStateId,
      workflowStateRefId: resolved.workflowStateRefId,
    };
  }
  // 'category' and 'required' both land the bare category — the canceled or
  // backlog grouping is what carries the semantic, not which state inside it.
  return { workflowCategory: target };
};
