'use client';

import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

/** Capabilities follow the Agent's saved model for every conversation. */
export const useEffectiveModel = (agentId: string) => {
  const [model, provider] = useAgentStore((s) => [
    agentByIdSelectors.getAgentModelById(agentId)(s),
    agentByIdSelectors.getAgentModelProviderById(agentId)(s),
  ]);

  return { model, provider };
};
