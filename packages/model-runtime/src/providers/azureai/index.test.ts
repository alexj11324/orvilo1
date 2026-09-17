// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentRuntimeErrorType } from '../../types/error';
import { OrviloAzureAI } from './index';

describe('OrviloAzureAI', () => {
  describe('constructor', () => {
    it('should throw error when apiKey is missing', () => {
      expect(() => new OrviloAzureAI({ baseURL: 'https://test.azure.com' })).toThrow();
    });

    it('should throw error when baseURL is missing', () => {
      expect(() => new OrviloAzureAI({ apiKey: 'test-key' })).toThrow();
    });

    it('should throw InvalidProviderAPIKey error when both apiKey and baseURL are missing', () => {
      try {
        new OrviloAzureAI();
      } catch (error: any) {
        expect(error.errorType).toBe(AgentRuntimeErrorType.InvalidProviderAPIKey);
      }
    });

    it('should initialize successfully with valid params', () => {
      const instance = new OrviloAzureAI({
        apiKey: 'test-key',
        baseURL: 'https://test.cognitiveservices.azure.com/openai',
      });

      expect(instance).toBeDefined();
      expect(instance.baseURL).toBe('https://test.cognitiveservices.azure.com/openai');
    });
  });

  describe('chat', () => {
    let instance: OrviloAzureAI;

    beforeEach(() => {
      instance = new OrviloAzureAI({
        apiKey: 'test-key',
        baseURL: 'https://test.cognitiveservices.azure.com/openai',
      });
    });

    it('should handle non-streaming responses', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello, how can I help you?',
              role: 'assistant',
            },
          },
        ],
        model: 'gpt-4',
      };

      const mockPost = vi.fn().mockResolvedValue({
        body: mockResponse,
      });

      vi.spyOn(instance.client, 'path').mockReturnValue({
        post: mockPost,
      } as any);

      const result = await instance.chat({
        messages: [{ content: 'Hello', role: 'user' }],
        model: 'gpt-4',
        stream: false,
      });

      expect(result).toBeDefined();
      expect(instance.client.path).toHaveBeenCalledWith('/chat/completions');
      expect(mockPost).toHaveBeenCalled();
    });

    it('should handle generic errors', async () => {
      const mockError = new Error('Network error');

      const mockPost = vi.fn().mockRejectedValue(mockError);

      vi.spyOn(instance.client, 'path').mockReturnValue({
        post: mockPost,
      } as any);

      try {
        await instance.chat({
          messages: [{ content: 'Hello', role: 'user' }],
          model: 'gpt-4',
        });
      } catch (error: any) {
        expect(error.errorType).toBe(AgentRuntimeErrorType.AgentRuntimeError);
      }
    });
  });

  describe('maskSensitiveUrl', () => {
    it('should mask subdomain in Azure URL', () => {
      const instance = new OrviloAzureAI({
        apiKey: 'test-key',
        baseURL: 'https://myresource.cognitiveservices.azure.com/openai',
      });

      const masked = (instance as any).maskSensitiveUrl(
        'https://myresource.cognitiveservices.azure.com/openai',
      );
      expect(masked).toBe('https://***.cognitiveservices.azure.com/openai');
    });
  });
});
