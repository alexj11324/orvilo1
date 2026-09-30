import type { TaskStatus } from '@orvilo/types';
import { cssVar, useThemeMode } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import HeterogeneousTag from '@/features/HeterogeneousTag';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
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
  // Same source as the home list so the runtime tag stays consistent.
  const assigneeHeterogeneousType = useHomeStore(
    (s) => homeAgentListSelectors.getAgentById(assigneeAgentId ?? '')(s)?.heterogeneousType,
  );
  const { isDarkMode } = useThemeMode();

  if (!taskId) return null;

  const chip = (
    <div
      className="flex items-center gap-2 px-[11px] py-1"
      style={{
        background: isDarkMode ? cssVar.colorFillSecondary : undefined,
        border: isDarkMode ? undefined : `1px solid ${cssVar.colorBorder}`,
        borderRadius: cssVar.borderRadiusLG,
        cursor: 'pointer',
        flex: 'none',
        maxWidth: '100%',
        minHeight: 32,
      }}
    >
      {assigneeAgentId ? (
        <>
          <AssigneeAvatar agentId={assigneeAgentId} size={20} />
          <div className="truncate block font-medium">{assigneeMeta?.title}</div>
          <HeterogeneousTag type={assigneeHeterogeneousType} />
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
        status === 'running' ? (agentId) => void handoffTask(taskId, agentId) : undefined
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
