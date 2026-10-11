import { useCallback } from 'react';

import { useFallbackAgentId } from '@/features/DefaultAgent/useFallbackAgentId';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import {
  runTaskWithContractCheck,
  type RunWithContractCheckResult,
} from '../shared/runWithContractCheck';
import { useTaskDetailSelector } from './TaskDetailScope';

export type { RunWithContractCheckResult } from '../shared/runWithContractCheck';

export const shouldPersistFallbackAssignee = (
  assigneeAgentId?: string | null,
  assigneeUserId?: string | null,
  fallbackAgentId?: string | null,
) => !assigneeAgentId && !assigneeUserId && !!fallbackAgentId;

/**
 * How the Issue page and the automation header start a run by hand: the
 * header control, the Execution area's Start / Retry / Resume and the overflow
 * menu's Run again all go through here, so none of them can skip the
 * permission, resource-access or contract checks. The Automations list's own
 * "Run now" does not use this hook.
 */
export const useRunWithContractCheck = () => {
  const { allowed: canEditTask, reason: permissionReason } = usePermission('create_content');
  const canPause = useTaskDetailSelector(taskDetailSelectors.canPauseTask);
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const assigneeAgentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const assigneeUserId = useTaskDetailSelector(taskDetailSelectors.taskAssigneeUserId);
  const fallbackAgentId = useFallbackAgentId();
  const runningActivity = detail?.activities?.find(
    (activity) =>
      activity.type === 'topic' &&
      activity.status === 'running' &&
      (!activity.sourceTaskId || activity.sourceTaskId === detail.id),
  );
  const executingAgentId = canPause
    ? runningActivity?.agentId ||
      (runningActivity?.author?.type === 'agent' ? runningActivity.author.id : undefined) ||
      assigneeAgentId
    : assigneeAgentId || fallbackAgentId;
  const { canUseResource, isAccessResolved: accessResolved } = useResourceAccess(
    'agent',
    executingAgentId || undefined,
  );
  const canExecuteTask = canEditTask && !!executingAgentId && canUseResource;
  const runTask = useTaskStore((s) => s.runTask);
  const updateTask = useTaskStore((s) => s.updateTask);

  const runWithContractCheck = useCallback(
    async (id: string): Promise<RunWithContractCheckResult> => {
      if (shouldPersistFallbackAssignee(assigneeAgentId, assigneeUserId, fallbackAgentId)) {
        await updateTask(id, { assigneeAgentId: fallbackAgentId });
      }
      return runTaskWithContractCheck(id, runTask);
    },
    [assigneeAgentId, assigneeUserId, fallbackAgentId, runTask, updateTask],
  );

  return { accessResolved, canEditTask, canExecuteTask, permissionReason, runWithContractCheck };
};
