import { Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { cssVar, useThemeMode } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import HeterogeneousTag from '@/features/HeterogeneousTag';
import { useHomeStore } from '@/store/home';
import { homeAgentListSelectors } from '@/store/home/selectors';
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
          <Text ellipsis weight={500}>
            {assigneeMeta?.title}
          </Text>
          <HeterogeneousTag type={assigneeHeterogeneousType} />
        </>
      ) : (
        <>
          <UnassignedAssigneeIcon kind={'agent'} />
          <Text style={{ color: cssVar.colorTextDescription }} weight={500}>
            {t('createTask.assignee')}
          </Text>
        </>
      )}
    </div>
  );

  return (
    <AssigneeAgentSelector
      currentAgentId={assigneeAgentId}
      disabled={status === 'running'}
      taskIdentifier={taskId}
      taskVisibility={visibility}
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
