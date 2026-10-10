'use client';

import { Markdown } from '@lobehub/ui';
import { DEFAULT_AVATAR } from '@orvilo/const';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';

import type { ExecuteTaskParams } from '../../../types';

export const ExecuteTaskStreaming = memo<BuiltinStreamingProps<ExecuteTaskParams>>(({ args }) => {
  const { agentId, instruction } = args || {};

  // Get active group ID and agent from store
  const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
  const agent = useAgentGroupStore((s) =>
    activeGroupId && agentId
      ? agentGroupSelectors.getAgentByIdFromGroup(activeGroupId, agentId)(s)
      : undefined,
  );

  if (!instruction) return null;

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Avatar
            avatar={agent?.avatar || DEFAULT_AVATAR}
            background={agent?.backgroundColor || 'var(--card)'}
            shape={'square'}
            size={24}
          />
          <span className="text-sm leading-[inherit] font-medium text-foreground">
            {agent?.title || 'Agent'}
          </span>
        </div>
        <div className="text-[13px] text-muted-foreground">
          <Markdown animated variant={'chat'}>
            {instruction}
          </Markdown>
        </div>
      </div>
    </div>
  );
});

ExecuteTaskStreaming.displayName = 'ExecuteTaskStreaming';

export default ExecuteTaskStreaming;
