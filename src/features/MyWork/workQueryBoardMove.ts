'use client';

import type { TaskWorkflowCategory } from '@orvilo/types';
import { WORKFLOW_STATE_REQUIRED } from '@orvilo/types';
import { t } from 'i18next';

import { toast } from '@/components/toast';
import {
  type KanbanColumnDefinition,
  type TaskStatusChoice,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { pickReviewerAgent } from '@/features/AgentTasks/features/ReviewerAgentSelector';
import {
  createTaskStatusCascadeModal,
  getOpenSubtasks,
} from '@/features/AgentTasks/features/TaskStatusCascadeModal';
import { taskService } from '@/services/task';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode, trpcErrorMessage } from '@/utils/trpcError';

import { createWorkflowStatePickerModal } from './WorkflowStatePickerModal';
import {
  type WorkQueryBoardTask,
  workQueryMovePlan,
  workQueryTargetKeyFromKanbanColumn,
} from './workQueryBoard';

export const moveBoardMaybePickingState = async (input: {
  expectedDomainRevision: number;
  groupBy: 'status' | 'workflowCategory';
  targetKey: string;
  /**
   * Precise `team_workflow_states` ref from the shared Issue status model —
   * an exact pick commits straight through the CAS write and never opens
   * the picker. Omit it for category-level targets, where a
   * WORKFLOW_STATE_REQUIRED reply still picks.
   */
  targetWorkflowStateRefId?: string;
  taskId: string;
  teamId?: string | null;
}): Promise<boolean> => {
  let expectedDomainRevision = input.expectedDomainRevision;
  if (input.groupBy === 'workflowCategory' && input.targetKey === 'in_review') {
    const { data: task } = await taskService.find(input.taskId);
    if (!task.reviewerAgentId) {
      const reviewerAgentId = await pickReviewerAgent();
      if (!reviewerAgentId) return false;
      await taskService.update(input.taskId, {
        reviewerAgentId,
        expectedDomainRevision: task.domainRevision,
      });
      expectedDomainRevision = (await taskService.find(input.taskId)).data.domainRevision;
    }
  }
  try {
    await workAttentionService.moveBoard({
      expectedDomainRevision,
      groupBy: input.groupBy,
      targetKey: input.targetKey,
      targetWorkflowStateRefId: input.targetWorkflowStateRefId,
      taskId: input.taskId,
    });
    return true;
  } catch (error) {
    if (
      input.groupBy !== 'workflowCategory' ||
      !input.teamId ||
      !isTrpcErrorCode(error, 'PRECONDITION_FAILED') ||
      trpcErrorMessage(error) !== WORKFLOW_STATE_REQUIRED
    ) {
      throw error;
    }
    const picked = await createWorkflowStatePickerModal({
      category: input.targetKey as TaskWorkflowCategory,
      teamId: input.teamId,
    });
    if (!picked) return false;
    await workAttentionService.moveBoard({
      expectedDomainRevision,
      groupBy: input.groupBy,
      targetKey: input.targetKey,
      taskId: input.taskId,
      targetWorkflowStateRefId: picked,
    });
    return true;
  }
};

/**
 * The "also complete/cancel its open sub-issues?" step every surface shares
 * when an Issue moves to Done or Canceled. With no open sub-issues there is
 * nothing to ask. Otherwise the dialog decides: "update all" commits the whole
 * family through `updateStatusCascade`; "parent only" runs the caller's own
 * write. Resolves with the revision to continue from, or `undefined` when the
 * user dismissed the dialog and nothing was written.
 */
export const resolveStatusCascade = async (input: {
  /** The caller's own way to move just this Issue; returns its resulting revision. */
  parentOnly: () => Promise<number>;
  status: 'canceled' | 'completed';
  task: { id: string; identifier: string };
}): Promise<{ cascaded: boolean; revision: number } | undefined> => {
  const tree = await taskService.getTaskTree(input.task.identifier);
  const root = tree.data.find(
    (item) => item.id === input.task.id || item.identifier === input.task.identifier,
  );
  if (!root) throw new Error('Task tree did not include its requested root');
  const openSubtasks = getOpenSubtasks(
    tree.data.filter((item) => item.id !== root.id && item.identifier !== root.identifier),
  );
  if (openSubtasks.length === 0) return { cascaded: false, revision: await input.parentOnly() };
  let outcome: { cascaded: boolean; revision: number } | undefined;
  const confirmed = await createTaskStatusCascadeModal({
    subtasks: openSubtasks,
    targetStatus: input.status,
    onApply: async (includeSubtasks) => {
      if (!includeSubtasks) {
        outcome = { cascaded: false, revision: await input.parentOnly() };
        return;
      }
      const result = await taskService.updateStatusCascade(input.task.identifier, input.status);
      outcome = { cascaded: true, revision: result.data.task.domainRevision };
    },
  });
  return confirmed ? outcome : undefined;
};

const applyWorkQueryBoardCascade = async (plan: {
  status: 'canceled' | 'completed';
  task: WorkQueryBoardTask;
}): Promise<number | undefined> => {
  const outcome = await resolveStatusCascade({
    parentOnly: async () => {
      await taskService.update(plan.task.id, { status: plan.status });
      const current = await taskService.find(plan.task.id);
      return current.data.domainRevision;
    },
    status: plan.status,
    task: plan.task,
  });
  return outcome?.revision;
};

export const workQueryBoardMoveToastKey = (
  error: unknown,
): 'myWork.moveBlocked' | 'myWork.moveConflict' | 'myWork.moveFailed' => {
  if (isTrpcErrorCode(error, 'CONFLICT')) return 'myWork.moveConflict';
  if (isTrpcErrorCode(error, 'PRECONDITION_FAILED')) return 'myWork.moveBlocked';
  return 'myWork.moveFailed';
};

const toastWorkQueryBoardMoveError = (error: unknown) => {
  toast.error(t(workQueryBoardMoveToastKey(error), { ns: 'common' }));
};

/**
 * Persist a drop on a work-query board (Saved View / Team) or an Issue-board
 * card. Every cross-column write goes through `moveBoard` — the CAS plus
 * exact-state picker — because Issue Status is workflow state everywhere;
 * the `status` axis remains only for execution Runs views (work-query `st:`
 * columns).
 */
export const commitWorkQueryBoardMove = async (input: {
  column: Pick<KanbanColumnDefinition, 'key' | 'targetStatus' | 'targetWorkflowCategory'>;
  groupBy: 'status' | 'workflowCategory';
  /** Exact workflow-state ref a precise pick carries into the CAS write. */
  targetWorkflowStateRefId?: string;
  task: WorkQueryBoardTask;
}): Promise<boolean> => {
  const groupBy = input.groupBy;
  const targetKey = workQueryTargetKeyFromKanbanColumn(groupBy, input.column);
  if (!targetKey) return false;
  const plan = workQueryMovePlan({
    groupBy,
    targetKey,
    targetWorkflowStateRefId: input.targetWorkflowStateRefId,
    task: input.task,
  });
  try {
    if (plan.type === 'noop') return true;
    if (plan.type === 'cascade') {
      let revision: number | undefined;
      try {
        revision = await applyWorkQueryBoardCascade(plan);
      } catch (loadError) {
        console.error('[WorkQueryBoard] Failed to inspect subtasks:', loadError);
        toast.error(t('taskDetail.statusCascade.loadFailed', { ns: 'chat' }));
        throw loadError;
      }
      if (revision === undefined) return false;
      if (groupBy !== 'workflowCategory') return true;
      return moveBoardMaybePickingState({
        expectedDomainRevision: revision,
        groupBy: 'workflowCategory',
        targetKey,
        targetWorkflowStateRefId: input.targetWorkflowStateRefId,
        taskId: plan.task.id,
        teamId: plan.task.teamId,
      });
    }
    if (plan.groupBy !== 'status' && plan.groupBy !== 'workflowCategory') return false;
    return moveBoardMaybePickingState({
      expectedDomainRevision: plan.expectedDomainRevision,
      groupBy: plan.groupBy,
      targetKey: plan.targetKey,
      targetWorkflowStateRefId: input.targetWorkflowStateRefId,
      taskId: input.task.id,
      teamId: input.task.teamId,
    });
  } catch (error) {
    toastWorkQueryBoardMoveError(error);
    throw error;
  }
};

/**
 * A pick from the Issue-status menu (list glyph, board card, context menu):
 * every row is a workflow move routed through the board's own drop path —
 * `moveBoard` CAS + exact-state picker. Status choices no longer carry raw
 * execution statuses.
 */
export const applyWorkQueryStatusChoice = async (input: {
  choice: TaskStatusChoice;
  task: WorkQueryBoardTask;
}): Promise<boolean> => {
  // An exact-state row commits the precise ref through the same CAS write —
  // the picker's multi-candidate ambiguity never applies to a named state.
  if (input.choice.state) {
    return commitWorkQueryBoardMove({
      column: input.choice.column,
      groupBy: 'workflowCategory',
      targetWorkflowStateRefId: input.choice.state.id,
      task: input.task,
    });
  }
  if (!input.choice.workflowCategory) return false;
  return commitWorkQueryBoardMove({
    column: input.choice.column,
    groupBy: 'workflowCategory',
    task: input.task,
  });
};
