import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { shouldPersistFallbackAssignee } from '@/features/AgentTasks/AgentTaskDetail/TaskDetailRunPauseAction';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { useTaskStore } from '@/store/task';

/**
 * The lifecycle actions every automation surface shares — pause/resume the
 * schedule, fire a manual run, or delete the underlying task. Store actions
 * take the task's identifier (e.g. "T-12"), not the row id.
 */
export const useAutomationActions = () => {
  const { t } = useTranslation('automation');
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const updateTask = useTaskStore((s) => s.updateTask);
  const runTask = useTaskStore((s) => s.runTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const inboxAgentId = useAgentStore(builtinAgentSelectors.inboxAgentId);

  const pause = useCallback(
    (identifier: string) => updateTaskStatus(identifier, 'paused'),
    [updateTaskStatus],
  );

  const resume = useCallback(
    (identifier: string) => updateTaskStatus(identifier, 'scheduled'),
    [updateTaskStatus],
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
      await runTask(task.identifier);
    },
    [inboxAgentId, runTask, updateTask],
  );

  const remove = useCallback(async (identifier: string) => deleteTask(identifier), [deleteTask]);

  return { pause, remove, resume, runNow, t };
};
