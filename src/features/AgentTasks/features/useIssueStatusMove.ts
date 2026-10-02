'use client';

import type { TaskWorkflowCategory } from '@orvilo/types';
import { t } from 'i18next';
import { useCallback } from 'react';

import { toast } from '@/components/toast';
import { shouldAutoRunForWorkflowMove } from '@/features/AgentTasks/features/shouldAutoRunForWorkflowMove';
import {
  moveBoardMaybePickingState,
  workQueryBoardMoveToastKey,
} from '@/features/MyWork/workQueryBoardMove';
import { mutate } from '@/libs/swr';
import { isTaskListKey, isWorkQueryTaskRowsKey } from '@/libs/swr/keys';
import { taskService } from '@/services/task';
import { useTaskStore } from '@/store/task';
import type { TaskStoreState } from '@/store/task/initialState';
import { taskDetailSelectors } from '@/store/task/selectors';

/**
 * The shared Issue status target — what every status surface commits: the
 * workflow category plus, when the pick names one, the exact
 * `team_workflow_states` row.
 */
export interface IssueStatusMoveTarget {
  category: TaskWorkflowCategory;
  workflowStateRefId?: string;
}

/**
 * The shared Issue status command. Detail rows, list glyphs, board cards and
 * context menus all land on the board's own write: a fresh `domainRevision`
 * fetch, then `moveBoard` CAS — an exact ref commits straight through, a
 * bare category resolves ambiguity through the workflow-state picker —
 * followed by one refresh across the detail map, `task:list` rows and every
 * work-query row cache. Unlinked tasks (no team) keep the plain
 * `task.update` category write.
 */
export const useIssueStatusMove = () => {
  const refreshDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const runTask = useTaskStore((s) => s.runTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const taskDetailMap = useTaskStore((s) => s.taskDetailMap);

  return useCallback(
    async (input: { taskIdentifier: string; target: IssueStatusMoveTarget }): Promise<boolean> => {
      const { data: task } = await taskService.find(input.taskIdentifier);
      const previousCategory = task.workflowCategory;
      const commit = async () => {
        if (
          shouldAutoRunForWorkflowMove({
            automationMode: task.automationMode,
            blocked: taskDetailMap
              ? taskDetailSelectors.isTaskBlocked(
                  { taskDetailMap } as TaskStoreState,
                  input.taskIdentifier,
                )
              : false,
            nextCategory: input.target.category,
            previousCategory,
            status: task.status,
          })
        ) {
          const started = await runTask(input.taskIdentifier);
          if (!started) toast.error(t('taskDetail.autoRunFailed', { ns: 'chat' }));
        }
      };
      if (!task.teamId) {
        await updateTask(input.taskIdentifier, { workflowCategory: input.target.category });
        await commit();
        return true;
      }
      try {
        const moved = await moveBoardMaybePickingState({
          expectedDomainRevision: task.domainRevision,
          groupBy: 'workflowCategory',
          targetKey: input.target.category,
          targetWorkflowStateRefId: input.target.workflowStateRefId,
          taskId: task.id,
          teamId: task.teamId,
        });
        if (!moved) return false;
      } catch (error) {
        toast.error(t(workQueryBoardMoveToastKey(error), { ns: 'common' }));
        throw error;
      }
      // The write already committed — a read-back failure must not surface
      // as a failed save.
      await Promise.all([
        refreshDetail(input.taskIdentifier),
        mutate(isWorkQueryTaskRowsKey),
        mutate(isTaskListKey),
      ]).catch(() => {});
      await commit();
      return true;
    },
    [refreshDetail, runTask, taskDetailMap, updateTask],
  );
};
