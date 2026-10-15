import type { ChatTopicMetadata } from '@orvilo/types';

import { getAgentStoreState } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

export type TopicReasoningSnapshot = Pick<ChatTopicMetadata, 'heteroEffort' | 'reasoningConfig'>;

/** Snapshot the Agent's discovered reasoning effort for a new topic. */
export const snapshotAgentReasoning = async (
  agentId: string | null | undefined,
): Promise<TopicReasoningSnapshot | undefined> => {
  if (!agentId) return undefined;

  const heterogeneousProvider =
    agentByIdSelectors.getAgencyConfigById(agentId)(getAgentStoreState())?.heterogeneousProvider;
  if (heterogeneousProvider) {
    const effort = heterogeneousProvider.effort;
    return effort === undefined ? undefined : { heteroEffort: effort };
  }

  return undefined;
};
