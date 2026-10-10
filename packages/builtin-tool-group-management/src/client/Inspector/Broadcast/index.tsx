'use client';

import { DEFAULT_AVATAR } from '@orvilo/const';
import type { AgentGroupMember, BuiltinInspectorProps } from '@orvilo/types';
import { cn } from 'cn';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import AvatarGroup from '@/components/Avatar/AvatarGroup';
import { useAgentGroupStore } from '@/store/agentGroup';
import { agentGroupSelectors } from '@/store/agentGroup/selectors';
import { shinyTextStyles } from '@/styles';

import type { BroadcastParams } from '../../../types';

export const BroadcastInspector = memo<BuiltinInspectorProps<BroadcastParams>>(
  ({ args, partialArgs, isArgumentsStreaming }) => {
    const { t } = useTranslation('plugin');

    const agentIds = args?.agentIds || partialArgs?.agentIds || [];

    // Get active group ID and agents from store
    const activeGroupId = useAgentGroupStore(agentGroupSelectors.activeGroupId);
    const groupAgents = useAgentGroupStore((s) =>
      activeGroupId ? agentGroupSelectors.getGroupAgents(activeGroupId)(s) : [],
    );

    // Get agent details for the broadcast targets
    const agents = useMemo(() => {
      if (!agentIds.length || !groupAgents.length) return [];
      return agentIds
        .map((id) => groupAgents.find((agent) => agent.id === id))
        .filter((agent): agent is AgentGroupMember => !!agent);
    }, [agentIds, groupAgents]);

    // Transform agents to Avatar.Group format
    const avatarItems = useMemo(
      () =>
        agents.map((agent) => ({
          avatar: agent.avatar || DEFAULT_AVATAR,
          background: agent.backgroundColor || 'var(--card)',
          key: agent.id,
          title: agent.title || undefined,
        })),
      [agents],
    );

    if (isArgumentsStreaming && agents.length === 0) {
      return (
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={shinyTextStyles.shinyText}>
            {t('builtins.orvilo-group-management.apiName.broadcast')}
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 overflow-hidden">
        <span
          className={cn(
            'shrink-0 whitespace-nowrap text-muted-foreground',
            isArgumentsStreaming && shinyTextStyles.shinyText,
          )}
        >
          {t('builtins.orvilo-group-management.inspector.broadcast.title')}
        </span>
        {avatarItems.length > 0 && <AvatarGroup items={avatarItems} shape={'circle'} size={24} />}
      </div>
    );
  },
);

BroadcastInspector.displayName = 'BroadcastInspector';

export default BroadcastInspector;
