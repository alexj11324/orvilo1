'use client';

import { toast } from '@lobehub/ui/base-ui';
import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { WORKFLOW_STATE_REQUIRED } from '@orvilo/types';
import { t } from 'i18next';

import {
  type KanbanColumnDefinition,
  kanbanColumnForSelectableStatus,
} from '@/features/AgentTasks/AgentTaskList/kanbanBoardModel';
import { createTaskStatusCascadeModal } from '@/features/AgentTasks/features/TaskStatusCascadeModal';
import { getOpenSubtasks } from '@/features/AgentTasks/features/useTaskStatusChange';
import { taskService } from '@/services/task';
import { workAttentionService } from '@/services/workAttention';
import { isTrpcErrorCode, trpcErrorMessage } from '@/utils/trpcError';

import { createWorkflowStatePickerModal } from './WorkflowStatePickerModal';
import {
  type WorkQueryBoardTask,
  workQueryMovePlan,
  workQueryTargetKeyFromKanbanColumn,
} from './workQueryBoard';

/** Linear-linked store-kanban drops use moveBoard + exact-state picker. */
export const storeKanbanUsesWorkflowMove = (
  groupBy: string,
  task: Pick<WorkQueryBoardTask, 'workflowStateId'>,
): boolean => groupBy === 'status' && Boolean(task.workflowStateId);

export const workQueryMoveGroupBy = (
  groupBy: 'status' | 'workflowCategory',
  task: Pick<WorkQueryBoardTask, 'workflowStateId'>,
): 'status' | 'workflowCategory' =>
  storeKanbanUsesWorkflowMove(groupBy, task) ? 'workflowCategory' : groupBy;

export const moveBoardMaybePickingState = async (input: {
  expectedDomainRevision: number;
  groupBy: 'status' | 'workflowCategory';
  targetKey: string;
  taskId: string;
  teamId?: string | null;
}): Promise<boolean> => {
  try {
    await workAttentionService.moveBoard({
      expectedDomainRevision: input.expectedDomainRevision,
      groupBy: input.groupBy,
      targetKey: input.targetKey,
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
 * Persist a drop on a work-query board (Saved View / Team) or a Linear-linked
 * store-kanban card. Unlinked store cards keep `task.update`. Linear cards
 * with `workflowStateId` promote a status-grouped drop onto the VIEW08
 * `moveBoard` CAS + exact-state picker.
 */
export const commitWorkQueryBoardMove = async (input: {
  column: Pick<KanbanColumnDefinition, 'key' | 'targetStatus' | 'targetWorkflowCategory'>;
  groupBy: 'status' | 'workflowCategory';
  task: WorkQueryBoardTask;
}): Promise<boolean> => {
  const groupBy = workQueryMoveGroupBy(input.groupBy, input.task);
  const targetKey = workQueryTargetKeyFromKanbanColumn(groupBy, input.column);
  if (!targetKey) return false;
  const plan = workQueryMovePlan({
    groupBy,
    targetKey,
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
        taskId: plan.task.id,
        teamId: plan.task.teamId,
      });
    }
    return moveBoardMaybePickingState({
      expectedDomainRevision: plan.expectedDomainRevision,
      groupBy: plan.groupBy,
      targetKey: plan.targetKey,
      taskId: input.task.id,
      teamId: input.task.teamId,
    });
  } catch (error) {
    toastWorkQueryBoardMoveError(error);
    throw error;
  }
};

export type WorkQueryListStatusResult = 'cancelled' | 'local' | 'moved';

/**
 * List glyph/context-menu status on a work-query row. Linear-linked cards
 * go through `moveBoard` (VIEW08 picker); unlinked cards stay on `task.update`.
 */
export const commitWorkQueryListStatus = async (input: {
  groupBy: 'status' | 'workflowCategory';
  status: TaskStatus;
  task: WorkQueryBoardTask;
}): Promise<WorkQueryListStatusResult> => {
  if (!input.task.workflowStateId) return 'local';
  const column = kanbanColumnForSelectableStatus(input.status);
  if (!column) return 'local';
  const moved = await commitWorkQueryBoardMove({
    column,
    groupBy: input.groupBy,
    task: input.task,
  });
  return moved ? 'moved' : 'cancelled';
};
