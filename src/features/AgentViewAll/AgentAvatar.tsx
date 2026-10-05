'use client';

import { type SidebarAgentItem } from '@orvilo/types';
import { memo } from 'react';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import AgentGroupAvatar from '@/features/AgentGroupAvatar';
import { AgentRuntimeIcon } from '@/features/AgentRuntimeIcon';

interface AgentAvatarProps {
  item: SidebarAgentItem;
  size: number;
}

/** Agent avatar that renders the stacked group variant for group chats. */
const AgentAvatar = memo<AgentAvatarProps>(({ item, size }) => {
  const { avatar, backgroundColor, type } = item;

  return type === 'group' ? (
    <AgentGroupAvatar
      avatar={typeof avatar === 'string' ? avatar : undefined}
      backgroundColor={backgroundColor || undefined}
      memberAvatars={Array.isArray(avatar) ? avatar : []}
      size={size}
    />
  ) : (
    <AgentRuntimeIcon size={size} type={item.heterogeneousType} />
  );
});

AgentAvatar.displayName = 'AgentViewAllAgentAvatar';

export default AgentAvatar;
