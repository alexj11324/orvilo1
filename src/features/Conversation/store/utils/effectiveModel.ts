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

/** Conversations always use the selected Agent's saved model. */
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
): EffectiveConversationModelConfig =>
  useAgentStore((state) => {
    const config = agentSelectors.getAgentConfigById(context.subAgentId ?? context.agentId)(state);
    return { model: config?.model, provider: config?.provider };
  });

export const getEffectiveConversationModel = (
  context: EffectiveConversationModelContext,
): string | undefined => getEffectiveConversationModelConfig(context).model;
