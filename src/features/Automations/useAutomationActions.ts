import type { TaskAutomationMode } from '@orvilo/types';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { shouldPersistFallbackAssignee } from '@/features/AgentTasks/AgentTaskDetail/TaskDetailRunPauseAction';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { mutate } from '@/libs/swr';
import { mcpEventsKeys } from '@/libs/swr/keys';
import { mcpEventsService } from '@/services/mcpEvents';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useTaskStore } from '@/store/task';

import { automationDetailPath } from './shared';

interface AutomationTarget {
  automationMode?: TaskAutomationMode | null;
  id?: string;
  identifier: string;
}

/**
 * The lifecycle actions every automation surface shares — pause/resume the
 * schedule, fire a manual run, or delete the underlying task. Store actions
 * take the task's identifier (e.g. "T-12"), not the row id.
 */
export const useAutomationActions = () => {
  const { t } = useTranslation('automation');
  const navigate = useWorkspaceAwareNavigate();
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const updateTask = useTaskStore((s) => s.updateTask);
  const runTask = useTaskStore((s) => s.runTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);

  const pause = useCallback(
    async (task: AutomationTarget) => {
      if (task.automationMode !== 'event') return updateTaskStatus(task.identifier, 'paused');
      const taskId = task.id ?? task.identifier;
      const trigger = (await mcpEventsService.list(taskId)).data.triggers[0];
      // Pausing an event definition blocks future occurrences and leaves its
      // current Agent run alone. Task status changes would cancel that run.
      if (trigger?.enabled) await mcpEventsService.pause(taskId, trigger.revision);
      await mutate(mcpEventsKeys.triggers(taskId));
    },
    [updateTaskStatus],
  );

  const resume = useCallback(
    async (task: AutomationTarget) => {
      if (task.automationMode === 'event') {
        navigate(`${automationDetailPath(task.identifier)}?tab=settings`);
        return 'settings' as const;
      }
      await updateTaskStatus(task.identifier, 'scheduled');
      return 'resumed' as const;
    },
    [navigate, updateTaskStatus],
  );

  const runNow = useCallback(
    async (task: {
      assigneeAgentId?: string | null;
      assigneeUserId?: string | null;
      identifier: string;
    }) => {
      if (shouldPersistFallbackAssignee(task.assigneeAgentId, task.assigneeUserId, inboxAgentId)) {
        await updateTask(task.identifier, { assigneeAgentId: inboxAgentId });
      }
      const result = await runTask(task.identifier, undefined, { throwOnError: true });
      if (!result) throw new Error(t('detail.toast_trigger_failed'));
    },
    [inboxAgentId, runTask, t, updateTask],
  );

  const remove = useCallback(async (identifier: string) => deleteTask(identifier), [deleteTask]);

  const batch = useCallback(
    async (action: 'delete' | 'pause' | 'resume', tasks: AutomationTarget[]) => {
      // A mixed batch goes to readiness before mutating any timer row.
      const eventTask = tasks.find((task) => task.automationMode === 'event');
      if (action === 'resume' && eventTask) return resume(eventTask);
      for (const task of tasks) {
        if (action === 'delete') await remove(task.identifier);
        else if (action === 'pause') await pause(task);
        else await resume(task);
      }
      return 'updated' as const;
    },
    [pause, remove, resume],
  );

  return { batch, pause, remove, resume, runNow, t };
};
