import type { ConversationContext } from '@orvilo/types';

import { getAgentStoreState, useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

export interface EffectiveConversationModelConfig {
  model?: string;
  provider?: string;
}

type EffectiveConversationModelContext = Pick<
  ConversationContext,
  'agentId' | 'groupId' | 'scope' | 'subAgentId' | 'topicId'
>;

export const getEffectiveConversationModelConfig = (
  context: EffectiveConversationModelContext,
): EffectiveConversationModelConfig => {
  const config = agentSelectors.getAgentConfigById(context.subAgentId ?? context.agentId)(
    getAgentStoreState(),
  );
  return { model: config?.model, provider: config?.provider };
};

export const useEffectiveConversationModelConfig = (
  context: EffectiveConversationModelContext,
): EffectiveConversationModelConfig => {
  const config = useAgentStore(
    agentSelectors.getAgentConfigById(context.subAgentId ?? context.agentId),
  );
  return { model: config?.model, provider: config?.provider };
};

export const getEffectiveConversationModel = (
  context: EffectiveConversationModelContext,
): string | undefined => getEffectiveConversationModelConfig(context).model;
