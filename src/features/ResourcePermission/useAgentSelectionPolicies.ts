import type { AgentTopicSharePolicy } from '@orvilo/types';

import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useResourcePermission } from './useResourcePermission';

export const useAgentSelectionPolicies = (agentId: string) => {
  const agent = useAgentStore(agentByIdSelectors.getAgentById(agentId));
  const update = useAgentStore((s) => s.updateAgentConfigById);
  const { data: access } = useResourcePermission('agent', agent?.workspaceId ? agentId : undefined);
  const viewerId = useUserStore(userProfileSelectors.userId);
  return {
    canEditPolicies:
      !!agent &&
      (agent.workspaceId ? access?.canManage === true : !!viewerId && agent.userId === viewerId),
    topicSharePolicy: agent?.agencyConfig?.topicSharePolicy ?? 'member',
    setTopicSharePolicy: (topicSharePolicy: AgentTopicSharePolicy) =>
      void update(agentId, { agencyConfig: { topicSharePolicy } }),
  };
};
