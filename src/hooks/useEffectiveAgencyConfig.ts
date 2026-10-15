import type { OrviloAgentAgencyConfig } from '@orvilo/types';
import { normalizeAgencyConfigHeterogeneousProvider } from '@orvilo/types';

import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

export interface UseEffectiveAgencyConfigResult {
  agencyConfig: OrviloAgentAgencyConfig | undefined;
  canDisplayExecutionTarget: boolean;
  canSelectExecutionTarget: boolean;
  canSelectPersonalDevice: boolean;
  isPreferenceLoading: boolean;
  workspaceScoped: boolean;
}

/** Runtime identity is shared by every caller of the Agent. */
export const useEffectiveAgencyConfig = (agentId?: string): UseEffectiveAgencyConfigResult => {
  const sharedAgencyConfig = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgencyConfigById(agentId)(s) : undefined,
  );
  const agent = useAgentStore((s) =>
    agentId ? agentByIdSelectors.getAgentById(agentId)(s) : undefined,
  );
  return {
    agencyConfig: normalizeAgencyConfigHeterogeneousProvider(sharedAgencyConfig),
    canDisplayExecutionTarget: !!agentId,
    canSelectExecutionTarget: false,
    canSelectPersonalDevice: false,
    isPreferenceLoading: false,
    workspaceScoped: !!agent?.workspaceId,
  };
};
