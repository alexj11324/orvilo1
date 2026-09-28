import type { ChatTopicMetadata } from '@orvilo/types';
import { resolveHeterogeneousProviderTopicModel } from '@orvilo/types';

import { getAgentStoreState } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

/**
 * Snapshot the given agent's current model/provider so a newly created topic
 * remembers which model it was started with. The snapshot is persisted to the
 * top-level `topics.model`/`provider` columns (the config source of truth) —
 * subsequent model switches while the topic is active overwrite those columns
 * (see `updateTopicModel`), and generation + ChatInput display resolve
 * from them (see `topicSelectors.getTopicModelById`).
 */
export const snapshotAgentModel = (
  agentId?: string | null,
): { model?: string; provider?: string } => {
  if (!agentId) return {};

  const agentState = getAgentStoreState();

  // Heterogeneous topics snapshot the selector value that will be passed to the
  // CLI (including `default`) or the bound API model. This keeps a topic stable
  // when the Agent default changes later.
  const heterogeneousProvider =
    agentByIdSelectors.getAgencyConfigById(agentId)(agentState)?.heterogeneousProvider;
  if (heterogeneousProvider) {
    return (
      resolveHeterogeneousProviderTopicModel(heterogeneousProvider) ??
      (heterogeneousProvider.type ? { provider: heterogeneousProvider.type } : {})
    );
  }

  // Non-hetero: the effective model IS the agent default when nothing is pinned,
  // so snapshotting the defaulted value is intended — it keeps the topic on the
  // model it started with even after the agent default later changes.
  return {
    model: agentByIdSelectors.getAgentModelById(agentId)(agentState),
    provider: agentByIdSelectors.getAgentModelProviderById(agentId)(agentState),
  };
};

export type TopicReasoningSnapshot = Pick<ChatTopicMetadata, 'heteroEffort' | 'reasoningConfig'>;

/**
 * Snapshot the reasoning effort that goes with {@link snapshotAgentModel} so a
 * new topic also remembers the effort it was started with (persisted to
 * `topics.metadata.reasoningConfig` / `heteroEffort`, see `ChatTopicMetadata`).
 *
 * - Heterogeneous agents pin the agent's `heterogeneousProvider.effort`.
 * - API models pin nothing at creation — the user-managed model-instance
 *   reasoning config is retired; a topic only carries `reasoningConfig` once
 *   something explicitly pins it.
 *
 * Returns undefined when there is nothing to pin, so callers can spread it
 * into `metadata` without leaving empty keys behind.
 */
export const snapshotAgentReasoning = async (
  agentId: string | null | undefined,
  _modelSnapshot: { model?: string; provider?: string },
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
