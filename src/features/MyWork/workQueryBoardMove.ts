'use client';

import type { TaskWorkflowCategory } from '@orvilo/types';
import { WORKFLOW_STATE_REQUIRED } from '@orvilo/types';
import { t } from 'i18next';

import { toast } from '@/components/toast';
import {
  type KanbanColumnDefinition,
  type TaskStatusChoice,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
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
  try {
    await workAttentionService.moveBoard({
      expectedDomainRevision: input.expectedDomainRevision,
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
      expectedDomainRevision: input.expectedDomainRevision,
      groupBy: input.groupBy,
      targetKey: input.targetKey,
      taskId: input.taskId,
      targetWorkflowStateRefId: picked,
    });
    return true;
  }
};

const applyWorkQueryBoardCascade = async (plan: {
  status: 'canceled' | 'completed';
  task: WorkQueryBoardTask;
}): Promise<number | undefined> => {
  const tree = await taskService.getTaskTree(plan.task.identifier);
  const root = tree.data.find(
    (item) => item.id === plan.task.id || item.identifier === plan.task.identifier,
  );
  if (!root) throw new Error('Task tree did not include its requested root');
  const openSubtasks = getOpenSubtasks(
    tree.data.filter((item) => item.id !== root.id && item.identifier !== root.identifier),
  );
  const applyStatus = async (includeSubtasks: boolean) => {
    if (includeSubtasks && openSubtasks.length > 0) {
      const result = await taskService.updateStatusCascade(plan.task.identifier, plan.status);
      return result.data.task.domainRevision;
    }
    await taskService.update(plan.task.id, { status: plan.status });
    const current = await taskService.find(plan.task.id);
    return current.data.domainRevision;
  };
  if (openSubtasks.length === 0) return applyStatus(false);
  let revision: number | undefined;
  const confirmed = await createTaskStatusCascadeModal({
    subtasks: openSubtasks,
    targetStatus: plan.status,
    onApply: async (includeSubtasks) => {
      revision = await applyStatus(includeSubtasks);
    },
  });
  if (!confirmed || revision === undefined) return undefined;
  return revision;
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
