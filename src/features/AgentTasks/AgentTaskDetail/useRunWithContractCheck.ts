import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { useResourceAccess } from '@/features/ResourcePermission/useResourceAccess';
import { usePermission } from '@/hooks/usePermission';
import { lambdaClient } from '@/libs/trpc/client';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { useTaskDetailSelector } from './TaskDetailScope';

export const shouldPersistFallbackAssignee = (
  assigneeAgentId?: string | null,
  assigneeUserId?: string | null,
  inboxAgentId?: string | null,
) => !assigneeAgentId && !assigneeUserId && !!inboxAgentId;

/** `canceled`: the reader declined the pending-contract-edits confirmation. */
export type RunWithContractCheckResult = 'canceled' | 'failed' | 'started';

/**
 * The one way the Issue and automation surfaces start a run by hand: the
 * header control, the Execution area's Start / Retry / Resume and the overflow
 * menu's Re-run all go through here, so none of them can skip the permission,
 * resource-access or contract checks.
 */
export const useRunWithContractCheck = () => {
  const { t } = useTranslation('chat');
  const { allowed: canEditTask, reason: permissionReason } = usePermission('create_content');
  const canPause = useTaskDetailSelector(taskDetailSelectors.canPauseTask);
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const assigneeAgentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const assigneeUserId = useTaskDetailSelector(taskDetailSelectors.taskAssigneeUserId);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);
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
    : assigneeAgentId || inboxAgentId;
  const { canUseResource } = useResourceAccess('agent', executingAgentId || undefined);
  const canExecuteTask = canEditTask && !!executingAgentId && canUseResource;
  const runTask = useTaskStore((s) => s.runTask);
  const updateTask = useTaskStore((s) => s.updateTask);

  /**
   * Contract-aware run (SB08): when goal/acceptance drifted from the adopted
   * contract's revisions, the run is explicitly a frozen-contract `repair`
   * and the user is told the edits stay pending for an approved replan — a
   * run never silently adopts or ignores constraint changes.
   */
  const runWithContractCheck = useCallback(
    async (id: string): Promise<RunWithContractCheckResult> => {
      if (shouldPersistFallbackAssignee(assigneeAgentId, assigneeUserId, inboxAgentId)) {
        await updateTask(id, { assigneeAgentId: inboxAgentId });
      }
      const context = await lambdaClient.task.contractContext.query({ id }).catch(() => undefined);
      if (context?.data?.pendingConstraintEdits) {
        const revision = context.data.contract?.revision;
        const confirmed = await new Promise<boolean>((resolve) => {
          confirmModal({
            cancelText: t('cancel', { ns: 'common' }),
            content: t('taskDetail.pendingContractEdits.content', {
              revision: revision ?? '?',
            }),
            okText: t('taskDetail.runNow'),
            onCancel: () => resolve(false),
            onOk: () => resolve(true),
            title: t('taskDetail.pendingContractEdits.title'),
          });
        });
        if (!confirmed) return 'canceled';
        return (await runTask(id, { intent: 'repair' })) ? 'started' : 'failed';
      }
      return (await runTask(id)) ? 'started' : 'failed';
    },
    [assigneeAgentId, assigneeUserId, inboxAgentId, runTask, t, updateTask],
  );

  return { canEditTask, canExecuteTask, permissionReason, runWithContractCheck };
};
