'use client';

import { Markdown } from '@lobehub/ui';
import { DEFAULT_AVATAR } from '@orvilo/const';
import type { AgentGroupMember, BuiltinStreamingProps } from '@orvilo/types';
import { createStaticStyles, useTheme } from 'antd-style';
import { memo, useMemo } from 'react';

import Avatar from '@/components/Avatar';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import type { ExecuteTasksParams } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  instruction: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  taskCard: css`
    padding: 12px;
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  taskTitle: css`
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

export const ExecuteTasksStreaming = memo<BuiltinStreamingProps<ExecuteTasksParams>>(({ args }) => {
  const { tasks } = args || {};
  const theme = useTheme();

  // Get active group ID and agents from store
  const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
  const groupAgents = useAgentGroupStore((s) =>
    activeGroupId ? agentGroupSelectors.getGroupAgents(activeGroupId)(s) : [],
  );

  // Get agent details for each task
  const tasksWithAgents = useMemo(() => {
    if (!tasks?.length || !groupAgents.length) return [];
    return tasks.map((task) => ({
      ...task,
      agent: groupAgents.find((agent) => agent.id === task.agentId) as AgentGroupMember | undefined,
    }));
  }, [tasks, groupAgents]);

  if (!tasksWithAgents.length) return null;

  return (
    <div className={styles.container}>
      {tasksWithAgents.map((task, index) => (
        <div className={styles.taskCard} key={task.agentId || index}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Avatar
                avatar={task.agent?.avatar || DEFAULT_AVATAR}
                background={task.agent?.backgroundColor || theme.colorBgContainer}
                shape={'square'}
                size={20}
              />
              <span className={styles.taskTitle}>{task.title || task.agent?.title || 'Task'}</span>
            </div>
            {task.instruction && (
              <div className={styles.instruction}>
                <Markdown animated variant={'chat'}>
                  {task.instruction}
                </Markdown>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

ExecuteTasksStreaming.displayName = 'ExecuteTasksStreaming';

export default ExecuteTasksStreaming;
