import { TRACING_SCENARIOS } from '@orvilo/const';
import {
  chainLangDetect,
  chainTranslate,
  LANG_DETECT_JSON_SCHEMA,
  LANG_DETECT_PROMPT_VERSION,
  TRANSLATE_JSON_SCHEMA,
  TRANSLATE_PROMPT_VERSION,
} from '@orvilo/prompts';
import { type ChatTranslate } from '@orvilo/types';

import { supportLocales } from '@/locales/resources';
import { aiChatService } from '@/services/aiChat';
import { messageService } from '@/services/message';
import { dbMessageSelectors } from '@/store/chat/selectors';
import { type ChatStore } from '@/store/chat/store';
import { type StoreSetter } from '@/store/types';
import { useUserStore } from '@/store/user';
import { systemAgentSelectors } from '@/store/user/selectors';

/**
 * chat translate
 */

type Setter = StoreSetter<ChatStore>;
export const chatTranslate = (set: Setter, get: () => ChatStore, _api?: unknown) =>
  new ChatTranslateActionImpl(set, get, _api);

export class ChatTranslateActionImpl {
  readonly #get: () => ChatStore;

  constructor(set: Setter, get: () => ChatStore, _api?: unknown) {
    void _api;
    void set;
    this.#get = get;
  }

  clearTranslate = async (id: string): Promise<void> => {
    await this.#get().updateMessageTranslate(id, false);
  };

  translateMessage = async (id: string, targetLang: string): Promise<void> => {
    const { updateMessageTranslate } = this.#get();

    const message = dbMessageSelectors.getDbMessageById(id)(this.#get());
    if (!message) return;

    // Get current agent for translation
    const { model, provider } = systemAgentSelectors.translation(useUserStore.getState());

    // create translate extra
    await updateMessageTranslate(id, { content: '', from: '', to: targetLang });

    // Create translate operation
    const { operationId } = this.#get().startOperation({
      context: {
        agentId: message.agentId,
        messageId: id,
        sessionId: message.sessionId,
        topicId: message.topicId,
      },
      label: 'Translating message',
      type: 'translate',
    });

    // Associate message with operation
    this.#get().associateMessageWithOperation(id, operationId);

    try {
      const abortController = new AbortController();

      // detect source language — a bound judgment, resolved from the topic's agent
      const detectEnvelope = await aiChatService.generateJSON(
        {
          ...chainLangDetect(message.content),
          model,
          provider,
          schema: LANG_DETECT_JSON_SCHEMA,
          tracing: {
            agentId: message.agentId,
            promptVersion: LANG_DETECT_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.LangDetect,
            schemaName: LANG_DETECT_JSON_SCHEMA.name,
            topicId: message.topicId,
          },
        },
        abortController,
      );

      const detected = (detectEnvelope?.data as { locale?: string } | undefined)?.locale;
      const from = detected && supportLocales.includes(detected) ? detected : '';

      // translate to target language
      const envelope = await aiChatService.generateJSON(
        {
          ...chainTranslate(message.content, targetLang),
          model,
          provider,
          schema: TRANSLATE_JSON_SCHEMA,
          tracing: {
            agentId: message.agentId,
            promptVersion: TRANSLATE_PROMPT_VERSION,
            scenario: TRACING_SCENARIOS.MessageTranslate,
            schemaName: TRANSLATE_JSON_SCHEMA.name,
            topicId: message.topicId,
          },
        },
        abortController,
      );

      const content = (envelope?.data as { translation?: string } | undefined)?.translation ?? '';

      await updateMessageTranslate(id, { content, from, to: targetLang });
      this.#get().completeOperation(operationId);
    } catch (error) {
      this.#get().failOperation(operationId, {
        message: error instanceof Error ? error.message : String(error),
        type: 'TranslateError',
      });
      throw error;
    }
  };

  updateMessageTranslate = async (
    id: string,
    data: Partial<ChatTranslate> | false,
  ): Promise<void> => {
    // Optimistic update
    this.#get().internal_dispatchMessage({
      id,
      key: 'translate',
      type: 'updateMessageExtra',
      value: data === false ? undefined : data,
    });

    // Persist to database
    await messageService.updateMessageTranslate(id, data);
  };
}

export type ChatTranslateAction = Pick<ChatTranslateActionImpl, keyof ChatTranslateActionImpl>;
