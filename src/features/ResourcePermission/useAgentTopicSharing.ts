'use client';

import type { AgentTopicSharePolicy } from '@orvilo/types';
import { useCallback } from 'react';

import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useResourcePermission } from './useResourcePermission';

export interface AgentTopicSharingState {
  canEditPolicies: boolean;
  setTopicSharePolicy: (policy: AgentTopicSharePolicy) => void;
  topicSharePolicy: AgentTopicSharePolicy;
}

/** Topic sharing is configured on the Agent, including group supervisors. */
export const useAgentTopicSharing = (agentId: string): AgentTopicSharingState => {
  const agent = useAgentStore(agentByIdSelectors.getAgentById(agentId));
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const { data: access } = useResourcePermission('agent', agent?.workspaceId ? agentId : undefined);
  const viewerId = useUserStore(userProfileSelectors.userId);
  const setTopicSharePolicy = useCallback(
    (topicSharePolicy: AgentTopicSharePolicy) =>
      void updateAgentConfigById(agentId, { agencyConfig: { topicSharePolicy } }),
    [agentId, updateAgentConfigById],
  );
  return {
    canEditPolicies:
      !!agent &&
      (agent.workspaceId ? access?.canManage === true : !!viewerId && agent.userId === viewerId),
    setTopicSharePolicy,
    topicSharePolicy: agent?.agencyConfig?.topicSharePolicy ?? 'member',
  };
};
