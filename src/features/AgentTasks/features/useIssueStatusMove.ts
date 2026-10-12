'use client';

import type { TaskWorkflowCategory } from '@orvilo/types';
import { t } from 'i18next';
import { useCallback } from 'react';

import { toast } from '@/components/toast';
import { shouldAutoRunForWorkflowMove } from '@/features/AgentTasks/features/shouldAutoRunForWorkflowMove';
import { runTaskWithContractCheck } from '@/features/AgentTasks/shared/runWithContractCheck';
import { cascadeStatusForBoardKey } from '@/features/MyWork/workQueryBoard';
import {
  moveBoardMaybePickingState,
  resolveStatusCascade,
  workQueryBoardMoveToastKey,
} from '@/features/MyWork/workQueryBoardMove';
import { mutate } from '@/libs/swr';
import { isTaskDetailKey, isTaskListKey, isWorkQueryTaskRowsKey } from '@/libs/swr/keys';
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
      // The write already committed — a read-back failure must not surface as
      // a failed save. A cascade also changed sub-issues, whose rows live in
      // other Issues' cached details, so every cached detail is refetched.
      const refreshAfterMove = (family: boolean) =>
        Promise.all([
          family ? mutate(isTaskDetailKey) : refreshDetail(input.taskIdentifier),
          mutate(isWorkQueryTaskRowsKey),
          mutate(isTaskListKey),
        ]).catch(() => {});
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
          // Declining the pending-contract-edits confirmation leaves the move in
          // place with no run; the Issue's Execution area then offers Start.
          const result = await runTaskWithContractCheck(input.taskIdentifier, runTask);
          if (result === 'failed') toast.error(t('taskDetail.autoRunFailed', { ns: 'chat' }));
        }
      };
      // Done / Canceled on an Issue with open sub-issues asks the same question
      // a board drop asks, under the board's own rule: an Issue tied to a
      // provider workflow state skips it so its exact state can be chosen.
      const cascadeStatus =
        previousCategory === input.target.category || task.workflowStateId
          ? null
          : cascadeStatusForBoardKey('workflowCategory', input.target.category);
      let expectedDomainRevision = task.domainRevision;
      let cascaded = false;
      if (cascadeStatus) {
        let outcome: Awaited<ReturnType<typeof resolveStatusCascade>>;
        try {
          outcome = await resolveStatusCascade({
            // "Parent only" (or nothing to ask) falls through to the ordinary move below.
            parentOnly: async () => task.domainRevision,
            status: cascadeStatus,
            task: { id: task.id, identifier: input.taskIdentifier },
          });
        } catch (error) {
          toast.error(t('taskDetail.statusCascade.loadFailed', { ns: 'chat' }));
          throw error;
        }
        if (!outcome) return false;
        if (outcome.cascaded) {
          // The family is already Done / Canceled. A team Issue still settles
          // its exact workflow state from the revision the cascade produced.
          expectedDomainRevision = outcome.revision;
          cascaded = true;
          if (!task.teamId) {
            await refreshAfterMove(true);
            return true;
          }
        }
      }
      if (!task.teamId) {
        await updateTask(input.taskIdentifier, { workflowCategory: input.target.category });
        await commit();
        return true;
      }
      try {
        const moved = await moveBoardMaybePickingState({
          expectedDomainRevision,
          groupBy: 'workflowCategory',
          targetKey: input.target.category,
          targetWorkflowStateRefId: input.target.workflowStateRefId,
          taskId: task.id,
          teamId: task.teamId,
        });
        if (!moved) {
          // Dismissing the exact-state picker does not undo a committed cascade.
          if (cascaded) await refreshAfterMove(true);
          return cascaded;
        }
      } catch (error) {
        if (cascaded) await refreshAfterMove(true);
        toast.error(t(workQueryBoardMoveToastKey(error), { ns: 'common' }));
        throw error;
      }
      await refreshAfterMove(cascaded);
      await commit();
      return true;
    },
    [refreshDetail, runTask, taskDetailMap, updateTask],
  );
};
