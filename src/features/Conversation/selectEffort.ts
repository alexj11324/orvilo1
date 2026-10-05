import type { HeterogeneousReasoningEffort } from '@orvilo/types';

import { useChatStore } from '@/store/chat';

/**
 * The single explicit "select effort" action for chat.
 *
 * Effort is conversation-scoped exactly like the model
 * (docs/development/chat-agent-model-ia.md §5.2): an open conversation pins it to
 * the topic through the existing `updateTopicHeteroEffort` pipeline, a blank
 * composer holds the pick until the first message creates the topic, and the
 * agent row is never written.
 */
export const selectEffortForConversation = async (effort: HeterogeneousReasoningEffort) => {
  const { activeTopicId, updateTopicHeteroEffort } = useChatStore.getState();

  if (activeTopicId) {
    await updateTopicHeteroEffort(activeTopicId, effort);
    return;
  }

  useChatStore.setState({ composerHeteroEffort: effort }, false, 'selectEffort/explicit');
};
