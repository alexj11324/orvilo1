'use client';

import { Markdown } from '@lobehub/ui';
import { DEFAULT_AVATAR } from '@orvilo/const';
import type { AgentGroupMember, BuiltinStreamingProps } from '@orvilo/types';
import { memo, useMemo } from 'react';

import Avatar from '@/components/Avatar';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import type { ExecuteTasksParams } from '../../../types';

export const ExecuteTasksStreaming = memo<BuiltinStreamingProps<ExecuteTasksParams>>(({ args }) => {
  const { tasks } = args || {};

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
    <div className="flex flex-col gap-3">
      {tasksWithAgents.map((task, index) => (
        <div
          className="rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3"
          key={task.agentId || index}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Avatar
                avatar={task.agent?.avatar || DEFAULT_AVATAR}
                background={task.agent?.backgroundColor || 'var(--card)'}
                shape={'square'}
                size={20}
              />
              <span className="text-[13px] font-medium text-foreground">
                {task.title || task.agent?.title || 'Task'}
              </span>
            </div>
            {task.instruction && (
              <div className="text-[13px] text-muted-foreground">
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
