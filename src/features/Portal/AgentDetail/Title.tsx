'use client';

import { agentDisplayName } from '@orvilo/types';
import { memo } from 'react';

import Avatar from '@/components/Avatar';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const Title = memo(() => {
  const agentId = useChatStore(chatPortalSelectors.agentDetailId);
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId || ''));
  const displayName = agentDisplayName(meta, agentId ?? '');

  return (
    <div className="flex flex-row items-center gap-2" style={{ minWidth: 0 }}>
      <Avatar
        avatar={meta.avatar}
        background={meta.backgroundColor}
        name={displayName}
        shape="square"
        size={24}
      />
      <div className="truncate min-w-0 font-medium">{displayName}</div>
    </div>
  );
});

export default Title;
