import type { HeterogeneousReasoningEffort } from '@orvilo/types';

import { useChatStore } from '@/store/chat';

interface SelectModelOptions {
  /**
   * Effort to persist together with the model. Only set when the picked model
   * cannot serve the effort already in effect — a topic must never keep a model
   * with an effort the new model cannot run (spec §5.2).
   */
  effort?: HeterogeneousReasoningEffort;
}

/**
 * The single explicit "select model" action for chat.
 *
 * Chat never writes the agent row (docs/development/chat-agent-model-ia.md §5.2):
 * an open conversation pins the model to its own topic, and a blank composer
 * holds the pick until the first message creates the topic. Agent-level model
 * config stays in Settings → Agents.
 */
export const selectModelForConversation = async (
  selection: { model: string; provider: string },
  { effort }: SelectModelOptions = {},
) => {
  const { activeTopicId, updateTopicHeteroPin, updateTopicModel } = useChatStore.getState();

  if (activeTopicId) {
    // One write for model + effort reset: `updateTopicHeteroPin` is the existing
    // pipeline for "the topic's model and its effort must land together".
    if (effort === undefined) {
      await updateTopicModel(activeTopicId, selection);
      return;
    }

    await updateTopicHeteroPin(activeTopicId, { ...selection, effort });
    return;
  }

  useChatStore.setState(
    {
      composerModelSelection: selection,
      ...(effort === undefined ? {} : { composerHeteroEffort: effort }),
    },
    false,
    'selectModel/explicit',
  );
};
