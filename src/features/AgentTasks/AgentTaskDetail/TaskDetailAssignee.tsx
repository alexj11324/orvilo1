import type { TaskStatus } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

const TaskDetailAssignee = memo(() => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailTaskId();
  const status = useTaskDetailSelector(taskDetailSelectors.taskStatus) as TaskStatus | undefined;
  const assigneeAgentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const visibility = useTaskDetailSelector(taskDetailSelectors.taskVisibility);
  const assigneeMeta = useAgentDisplayMeta(assigneeAgentId);
  const handoffTask = useTaskStore((s) => s.handoffTask);

  if (!taskId) return null;

  const chip = (
    <div className="flex min-w-0 max-w-full cursor-pointer items-center gap-1.5">
      {assigneeAgentId ? (
        <>
          <AssigneeAvatar agentId={assigneeAgentId} size={16} />
          <span className="truncate">{assigneeMeta?.title}</span>
        </>
      ) : (
        <>
          <UnassignedAssigneeIcon kind={'agent'} size={16} />
          <span className={styles.propertyPlaceholder}>{t('createTask.assignee')}</span>
        </>
      )}
    </div>
  );

  return (
    <AssigneeAgentSelector
      currentAgentId={assigneeAgentId}
      taskIdentifier={taskId}
      taskVisibility={visibility}
      onHandoff={
        // A running task's agent is its incumbent executor — changing it is
        // an execution-ownership handoff (confirmed in the selector), not a
        // bare assignee edit.
        status === 'running' ? (agentId) => handoffTask(taskId, agentId) : undefined
      }
    >
      {assigneeAgentId ? (
        chip
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger render={chip} />
            <TooltipContent>{t('taskList.unassignedAgentHint')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </AssigneeAgentSelector>
  );
});

export default TaskDetailAssignee;
