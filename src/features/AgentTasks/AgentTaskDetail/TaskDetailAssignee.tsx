import type { TaskStatus } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
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
    <div
      aria-label={t('taskList.assignTo')}
      className="flex min-w-0 cursor-pointer items-center gap-1.5"
      style={{
        cursor: 'pointer',
        flex: 'none',
        maxWidth: '100%',
      }}
    >
      {assigneeAgentId ? (
        <>
          <Avatar
            avatar={<AssigneeAvatar agentId={assigneeAgentId} size={16} />}
            shape="circle"
            size={16}
          />
          <div className="truncate block font-medium">{assigneeMeta?.title}</div>
        </>
      ) : (
        <>
          <UnassignedAssigneeIcon kind={'agent'} />
          <div className="font-medium" style={{ color: cssVar.colorTextDescription }}>
            {t('createTask.assignee')}
          </div>
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
