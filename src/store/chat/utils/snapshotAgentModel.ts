import type { ChatTopicMetadata } from '@orvilo/types';

import { getAgentStoreState } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

export type TopicReasoningSnapshot = Pick<ChatTopicMetadata, 'heteroEffort' | 'reasoningConfig'>;

export const snapshotAgentReasoning = async (
  agentId: string | null | undefined,
): Promise<TopicReasoningSnapshot | undefined> => {
  if (!agentId) return;
  const effort =
    agentByIdSelectors.getAgencyConfigById(agentId)(getAgentStoreState())?.heterogeneousProvider
      ?.effort;
  return effort === undefined ? undefined : { heteroEffort: effort };
};
