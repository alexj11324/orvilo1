import {
  applyTopicExecutionConfig,
  type OrviloAgentAgencyConfig,
  type TopicExecutionConfig,
} from '@orvilo/types';

import { agentGroupByIdSelectors, getChatGroupStoreState } from '@/store/agentGroup';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';

export const getTopicAgencyConfig = (
  defaults: OrviloAgentAgencyConfig | undefined,
  topicId?: string | null,
) =>
  applyTopicExecutionConfig(
    defaults,
    topicId
      ? topicSelectors.getTopicById(topicId)(useChatStore.getState())?.metadata?.executionConfig
      : undefined,
  );

export const getTopicWorkspaceScoped = (
  defaults: OrviloAgentAgencyConfig | undefined,
  topicId: string | null | undefined,
  fallback: boolean,
) => {
  const execution = topicId
    ? topicSelectors.getTopicById(topicId)(useChatStore.getState())?.metadata?.executionConfig
    : undefined;
  return resolveTopicAgencyConfig(defaults, execution, fallback).workspaceScoped;
};

/** Keep the UI and dispatch interpretation of a Topic selection identical. */
export const resolveTopicAgencyConfig = (
  defaults: OrviloAgentAgencyConfig | undefined,
  execution: TopicExecutionConfig | undefined,
  workspaceScoped: boolean,
) => ({
  agencyConfig: applyTopicExecutionConfig(defaults, execution),
  workspaceScoped:
    execution &&
    !execution.inheritWorkspaceScope &&
    defaults?.executionTargetSelectionPolicy !== 'fixed'
      ? false
      : workspaceScoped,
});

/**
 * Whether `agentId` is the orchestrating supervisor of group `groupId`.
 * Supervisor turns need the server's group-orchestration callbacks, so runtime
 * selection reads this to coerce them onto Gateway (see `selectRuntimeType`).
 */
export const resolveIsGroupSupervisor = (
  agentId: string | null | undefined,
  groupId: string | null | undefined,
): boolean => {
  if (!agentId || !groupId) return false;
  return (
    agentGroupByIdSelectors.groupById(groupId)(getChatGroupStoreState())?.supervisorAgentId ===
    agentId
  );
};
