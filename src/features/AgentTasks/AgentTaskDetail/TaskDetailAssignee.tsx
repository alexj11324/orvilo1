import type { TaskStatus } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import AssigneeAgentSelector from '../features/AssigneeAgentSelector';
import AssigneeAvatar from '../features/AssigneeAvatar';
import { UnassignedAssigneeIcon } from '../features/UnassignedAssigneeIcon';
import { useAgentDisplayMeta } from '../shared/useAgentDisplayMeta';
import { RAIL_CONTROL_CLASS, RAIL_PLACEHOLDER_CLASS } from './railControl';
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

  const value = assigneeAgentId ? (
    <>
      <AssigneeAvatar agentId={assigneeAgentId} size={16} />
      <span className="truncate">{assigneeMeta?.title}</span>
    </>
  ) : (
    <>
      <UnassignedAssigneeIcon kind={'agent'} size={16} />
      <span className={RAIL_PLACEHOLDER_CLASS}>{t('createTask.assignee')}</span>
    </>
  );

  // The trigger is the picker's own Button. The unassigned hint is its native
  // title, not a Tooltip trigger nested inside the popover trigger.
  return (
    <AssigneeAgentSelector
      currentAgentId={assigneeAgentId}
      taskIdentifier={taskId}
      taskVisibility={visibility}
      control={{
        className: RAIL_CONTROL_CLASS,
        title: assigneeAgentId ? undefined : t('taskList.unassignedAgentHint'),
      }}
      onHandoff={
        // A running task's agent is its incumbent executor — changing it is
        // an execution-ownership handoff (confirmed in the selector), not a
        // bare assignee edit.
        status === 'running' ? (agentId) => handoffTask(taskId, agentId) : undefined
      }
    >
      {value}
    </AssigneeAgentSelector>
  );
});

export default TaskDetailAssignee;
