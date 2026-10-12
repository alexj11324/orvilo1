import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import { resolveAgentAgencyConfig } from '@orvilo/types';

import { useAgentManagementAccess } from '@/features/ResourcePermission/useAgentManagementAccess';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

export interface UseEffectiveAgencyConfigResult {
  agencyConfig: OrviloAgentAgencyConfig | undefined;
  canDisplayExecutionTarget: boolean;
  canSelectExecutionTarget: boolean;

  isPreferenceLoading: boolean;
  workspaceScoped: boolean;
}

/** Every caller reads the Agent's saved routing; only managers may edit it. */
export const useEffectiveAgencyConfig = (agentId?: string): UseEffectiveAgencyConfigResult => {
  const agencyConfig = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgencyConfigById(agentId)(s) : undefined,
  );
  const agent = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgentById(agentId)(s) : undefined,
  );
  const { canManageAgent, isAccessLoading } = useAgentManagementAccess(agentId);
  const workspaceScoped = !!agent?.workspaceId && agent.visibility !== 'private';
  return {
    agencyConfig: resolveAgentAgencyConfig(agencyConfig),
    canDisplayExecutionTarget: !!agentId && !isAccessLoading,
    canSelectExecutionTarget: !!agentId && canManageAgent && !isAccessLoading,

    isPreferenceLoading: isAccessLoading,
    workspaceScoped,
  };
};
