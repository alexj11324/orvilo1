import { Block, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { cssVar, useThemeMode } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
      <Tooltip title={assigneeAgentId ? undefined : t('taskList.unassignedAgentHint')}>
        <Block
          clickable
          horizontal
          align="center"
          gap={8}
          paddingBlock={4}
          paddingInline={11}
          style={{ flex: 'none', maxWidth: '100%', minHeight: 32 }}
          variant={isDarkMode ? 'filled' : 'outlined'}
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
        </Block>
      </Tooltip>
    </AssigneeAgentSelector>
  );
});

export default TaskDetailAssignee;
