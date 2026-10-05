import { useCallback, useMemo } from 'react';

import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';
import type { TopicGroupMode } from '@/types/topic';

/**
 * The sidebar's topic group mode.
 *
 * A GLOBAL reading preference, not agent config: the list spans every agent's
 * conversations, so remembering the mode per agent was both wrong for the
 * unified list and a persistent write to an agent from chat — forbidden by
 * docs/development/chat-agent-model-ia.md §5.2 / §5.5. The per-agent
 * `chatConfig.topicGroupMode` field stays in place (existing rows may carry it)
 * but is no longer read or written here.
 */
export const useAgentTopicGroupMode = () => {
  const topicGroupMode = useUserStore(preferenceSelectors.topicGroupMode);
  const updatePreference = useUserStore((s) => s.updatePreference);

  const updateTopicGroupMode = useCallback(
    async (mode: TopicGroupMode) => {
      await updatePreference({ topicGroupMode: mode });
    },
    [updatePreference],
  );

  return useMemo(
    () => ({
      topicGroupMode,
      updateTopicGroupMode,
    }),
    [topicGroupMode, updateTopicGroupMode],
  );
};
