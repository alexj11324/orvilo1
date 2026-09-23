import { TRACING_SCENARIOS } from '@orvilo/const';
import {
  chainSummaryHistory,
  SUMMARY_HISTORY_JSON_SCHEMA,
  SUMMARY_HISTORY_PROMPT_VERSION,
} from '@orvilo/prompts';
import { type UIChatMessage } from '@orvilo/types';

import { aiChatService } from '@/services/aiChat';
import { topicService } from '@/services/topic';
import { type ChatStore } from '@/store/chat';
import { type StoreSetter } from '@/store/types';
import { useUserStore } from '@/store/user';
import { systemAgentSelectors } from '@/store/user/selectors';

type Setter = StoreSetter<ChatStore>;
export const chatMemory = (set: Setter, get: () => ChatStore, _api?: unknown) =>
  new ChatMemoryActionImpl(set, get, _api);

export class ChatMemoryActionImpl {
  readonly #get: () => ChatStore;

  constructor(set: Setter, get: () => ChatStore, _api?: unknown) {
    void _api;
    void set;
    this.#get = get;
  }

  internal_summaryHistory = async (messages: UIChatMessage[]): Promise<void> => {
    const topicId = this.#get().activeTopicId;
    if (messages.length <= 1 || !topicId) return;

    const { model, provider } = systemAgentSelectors.historyCompress(useUserStore.getState());

    const envelope = await aiChatService.generateJSON(
      {
        ...chainSummaryHistory(messages),
        model,
        provider,
        schema: SUMMARY_HISTORY_JSON_SCHEMA,
        tracing: {
          agentId: this.#get().activeAgentId,
          promptVersion: SUMMARY_HISTORY_PROMPT_VERSION,
          scenario: TRACING_SCENARIOS.HistorySummary,
          schemaName: SUMMARY_HISTORY_JSON_SCHEMA.name,
          topicId,
        },
      },
      new AbortController(),
    );

    const historySummary = (envelope?.data as { summary?: string } | undefined)?.summary ?? '';

    await topicService.updateTopic(topicId, {
      historySummary,
      metadata: { model, provider },
    });
    await this.#get().refreshTopic();
    await this.#get().refreshMessages();
  };
}

export type ChatMemoryAction = Pick<ChatMemoryActionImpl, keyof ChatMemoryActionImpl>;
