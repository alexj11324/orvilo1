import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

/** Capabilities follow the selected Agent's saved model. */
export const useEffectiveModel = (agentId: string): { model: string; provider: string } => {
  const [model, provider] = useAgentStore((s) => [
    agentByIdSelectors.getAgentModelById(agentId)(s),
    agentByIdSelectors.getAgentModelProviderById(agentId)(s),
  ]);
  return { model, provider };
};
