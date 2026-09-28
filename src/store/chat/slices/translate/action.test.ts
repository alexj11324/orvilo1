import { act, renderHook } from '@testing-library/react';
import { type Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { aiChatService } from '@/services/aiChat';
import { messageService } from '@/services/message';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import { useChatStore } from '../../store';

// Mock messageService and aiChatService
vi.mock('@/services/message', () => ({
  messageService: {
    updateMessageTTS: vi.fn(),
    updateMessageTranslate: vi.fn(),
    updateMessage: vi.fn(),
  },
}));

vi.mock('@/services/aiChat', () => ({
  aiChatService: {
    generateJSON: vi.fn(),
  },
}));

vi.mock('@/store/user', () => ({
  useUserStore: {
    getState: vi.fn(() => ({})),
  },
}));

vi.mock('@/store/user/selectors', () => ({
  systemAgentSelectors: {
    translation: vi.fn(() => ({})),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatEnhanceAction', () => {
  describe('translateMessage', () => {
    it('should translate a message to the target language', async () => {
      const messageId = 'message-id';
      const targetLang = 'zh-CN';
      const messageContent = 'Hello World';
      const detectedLang = 'en-US';
      const translatedText = '你好世界';

      // Setup initial state
      act(() => {
        useChatStore.setState({
          activeAgentId: 'session',
          dbMessagesMap: {
            [messageMapKey({ agentId: 'session' })]: [
              {
                id: messageId,
                content: messageContent,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                role: 'assistant',
                sessionId: 'session',
              },
            ],
          },
        });
      });

      // First call for language detection
      (aiChatService.generateJSON as Mock).mockResolvedValueOnce({
        data: { locale: detectedLang },
        tracingId: 'tracing-1',
      });

      // Second call for translation
      (aiChatService.generateJSON as Mock).mockResolvedValueOnce({
        data: { translation: translatedText },
        tracingId: 'tracing-2',
      });

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.translateMessage(messageId, targetLang);
      });

      expect(aiChatService.generateJSON).toHaveBeenCalledTimes(2);
      expect(messageService.updateMessageTranslate).toHaveBeenLastCalledWith(messageId, {
        content: translatedText,
        from: detectedLang,
        to: targetLang,
      });
    });
  });

  describe('clearTranslate', () => {
    it('should clear translation for a message and refresh messages', async () => {
      const { result } = renderHook(() => useChatStore());
      const messageId = 'message-id';

      await act(async () => {
        await result.current.clearTranslate(messageId);
      });

      expect(messageService.updateMessageTranslate).toHaveBeenCalledWith(messageId, false);
    });
  });
});
