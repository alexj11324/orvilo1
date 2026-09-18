import {
  applyTopicExecutionConfig,
  type OrviloAgentAgencyConfig,
  type TopicExecutionConfig,
} from '@orvilo/types';

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
