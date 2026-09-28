// @vitest-environment node
import OpenAI from 'openai';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as nonStreamToStreamModule from '../../core/openaiCompatibleFactory/nonStreamToStream';
import * as streamsModule from '../../core/streams';
import * as debugStreamModule from '../../utils/debugStream';
import * as getModelPricingModule from '../../utils/getModelPricing';
import { OrviloAzureOpenAI } from './index';

const bizErrorType = 'ProviderBizError';
const invalidErrorType = 'InvalidProviderAPIKey';

// Mock the console.error to avoid polluting test output
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('OrviloAzureOpenAI', () => {
  let instance: OrviloAzureOpenAI;

  beforeEach(() => {
    instance = new OrviloAzureOpenAI({
      baseURL: 'https://test.openai.azure.com/',
      apiKey: 'test_key',
    });

    // 使用 vi.spyOn 来模拟 streamChatCompletions 方法
    vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue(
      new ReadableStream() as any,
    );
    vi.spyOn(instance['client'].responses, 'create').mockResolvedValue(new ReadableStream() as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw InvalidAzureAPIKey error when apikey or endpoint is missing', () => {
      try {
        new OrviloAzureOpenAI();
      } catch (e) {
        expect(e).toEqual({ errorType: invalidErrorType });
      }
    });

    it('should create an instance of OpenAIClient with correct parameters', () => {
      const baseURL = 'https://test.openai.azure.com/';
      const apiKey = 'test_key';

      const instance = new OrviloAzureOpenAI({ baseURL, apiKey });

      expect(instance.client).toBeInstanceOf(OpenAI);
      expect(instance.baseURL).toBe('https://test.openai.azure.com/openai/v1');
    });
  });

  describe('chat', () => {
    it('should return a Response on successful API call', async () => {
      // Arrange
      const mockStream = new ReadableStream();
      const mockResponse = Promise.resolve(mockStream);

      (instance['client'].chat.completions.create as Mock).mockResolvedValue(mockResponse);
      vi.spyOn(getModelPricingModule, 'getModelPricing').mockResolvedValue(undefined);

      // Act
      const result = await instance.chat({
        messages: [{ content: 'Hello', role: 'user' }],
        model: 'text-davinci-003',
        temperature: 0,
      });

      // Assert
      expect(result).toBeInstanceOf(Response);
    });

    describe('streaming response', () => {
      it('should use responses API and append web_search tool when enabledSearch is true', async () => {
        const mockStream = new ReadableStream() as any;
        const mockPricing = { units: [] };

        instance = new OrviloAzureOpenAI({
          apiKey: 'test_key',
          baseURL: 'https://test.openai.azure.com/',
          id: 'orvilo',
        });

        vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue(
          new ReadableStream() as any,
        );
        vi.spyOn(instance['client'].responses, 'create').mockResolvedValue(mockStream);
        vi.spyOn(getModelPricingModule, 'getModelPricing').mockResolvedValue(mockPricing as any);
        vi.spyOn(streamsModule, 'OpenAIResponsesStream').mockReturnValue(new ReadableStream());

        await instance.chat({
          enabledSearch: true,
          messages: [{ role: 'user', content: "Search for today's OpenAI news." }],
          model: 'gpt-5.4',
          reasoning_effort: 'medium',
          stream: true,
          top_p: 0.9,
          verbosity: 'high',
        } as any);

        expect(instance['client'].chat.completions.create).not.toHaveBeenCalled();

        const createCall = (instance['client'].responses.create as Mock).mock.calls[0][0];

        expect(createCall.input).toBeDefined();
        expect(createCall.model).toBe('gpt-5.4');
        expect(createCall.reasoning).toEqual({ effort: 'medium', summary: 'auto' });
        expect(createCall.store).toBe(false);
        expect(createCall.stream).toBe(true);
        expect(createCall.text).toEqual({ verbosity: 'high' });
        expect(createCall.top_p).toBeUndefined();
        expect(createCall.tools).toEqual(
          expect.arrayContaining([expect.objectContaining({ type: 'web_search' })]),
        );

        expect(streamsModule.OpenAIResponsesStream).toHaveBeenCalledWith(
          mockStream,
          expect.objectContaining({
            inputStartAt: expect.any(Number),
            payload: expect.objectContaining({
              apiMode: 'responses',
              model: 'gpt-5.4',
              pricing: mockPricing,
              provider: 'orvilo',
            }),
          }),
        );
      });

      it('should preserve GPT-5.6 Pro mode and Max effort in Responses payloads', async () => {
        const mockStream = new ReadableStream() as any;

        vi.spyOn(instance['client'].responses, 'create').mockResolvedValue(mockStream);
        vi.spyOn(getModelPricingModule, 'getModelPricing').mockResolvedValue(undefined);
        vi.spyOn(streamsModule, 'OpenAIResponsesStream').mockReturnValue(new ReadableStream());

        await instance.chat({
          messages: [{ content: 'Review this migration.', role: 'user' }],
          model: 'gpt-5.6-sol',
          reasoning: { mode: 'pro' },
          reasoning_effort: 'max',
          stream: true,
        });

        const createCall = (instance['client'].responses.create as Mock).mock.calls[0][0];

        expect(createCall.reasoning).toEqual({
          effort: 'max',
          mode: 'pro',
          summary: 'auto',
        });
      });

      it('should prune the sampling params GPT-6 Astra rejects on the Responses API', async () => {
        const mockStream = new ReadableStream() as any;
        vi.spyOn(instance['client'].responses, 'create').mockResolvedValue(mockStream);
        vi.spyOn(getModelPricingModule, 'getModelPricing').mockResolvedValue(undefined);
        vi.spyOn(streamsModule, 'OpenAIResponsesStream').mockReturnValue(new ReadableStream());

        await instance.chat({
          messages: [{ content: 'Review this migration.', role: 'system' }],
          model: 'gpt-6-astra',
          reasoning_effort: 'xhigh',
          stream: true,
          temperature: 0.7,
          top_p: 0.9,
        } as any);

        const createCall = (instance['client'].responses.create as Mock).mock.calls[0][0];

        expect(createCall.model).toBe('gpt-6-astra');
        expect(createCall.reasoning).toEqual({ effort: 'xhigh', summary: 'auto' });
        expect(createCall.input[0].role).toBe('developer');
        expect(createCall.temperature).toBeUndefined();
        expect(createCall.top_logprobs).toBeUndefined();
        expect(createCall.top_p).toBeUndefined();
      });

      it('should use deploymentName for Azure Responses API requests while keeping logical model for pricing', async () => {
        const mockStream = new ReadableStream() as any;
        const mockPricing = { units: [] };

        instance = new OrviloAzureOpenAI({
          apiKey: 'test_key',
          baseURL: 'https://test.openai.azure.com/',
          id: 'orvilo',
        });

        vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue(
          new ReadableStream() as any,
        );
        vi.spyOn(instance['client'].responses, 'create').mockResolvedValue(mockStream);
        vi.spyOn(getModelPricingModule, 'getModelPricing').mockResolvedValue(mockPricing as any);
        vi.spyOn(streamsModule, 'OpenAIResponsesStream').mockReturnValue(new ReadableStream());

        await instance.chat({
          deploymentName: 'prod-gpt-54',
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'gpt-5.4',
          stream: true,
        } as any);

        expect(instance['client'].chat.completions.create).not.toHaveBeenCalled();

        const createCall = (instance['client'].responses.create as Mock).mock.calls[0][0];

        expect(createCall.model).toBe('prod-gpt-54');
        expect(createCall.reasoning).toEqual({ summary: 'auto' });
        expect(createCall.deploymentName).toBeUndefined();

        expect(streamsModule.OpenAIResponsesStream).toHaveBeenCalledWith(
          mockStream,
          expect.objectContaining({
            payload: expect.objectContaining({
              apiMode: 'responses',
              model: 'gpt-5.4',
              pricing: mockPricing,
              provider: 'orvilo',
            }),
          }),
        );
      });

      it('should strip unsupported params for Azure reasoning models and include usage in stream options', async () => {
        const mockStream = new ReadableStream() as any;
        const mockPricing = { units: [] };

        instance = new OrviloAzureOpenAI({
          apiKey: 'test_key',
          baseURL: 'https://test.openai.azure.com/',
          id: 'orvilo',
        });

        vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue(mockStream);
        vi.spyOn(getModelPricingModule, 'getModelPricing').mockResolvedValue(mockPricing as any);
        vi.spyOn(streamsModule, 'OpenAIStream').mockReturnValue(new ReadableStream());

        await instance.chat({
          frequency_penalty: 0.4,
          logit_bias: { '42': 1 },
          logprobs: true,
          max_tokens: 256,
          messages: [{ role: 'system', content: 'You are helpful.' }],
          model: 'o3',
          presence_penalty: 0.3,
          reasoning_effort: 'minimal',
          temperature: 0.7,
          top_logprobs: 2,
          top_p: 0.9,
        } as any);

        const createCall = (instance['client'].chat.completions.create as Mock).mock.calls[0][0];

        expect(createCall.frequency_penalty).toBeUndefined();
        expect(createCall.logit_bias).toBeUndefined();
        expect(createCall.logprobs).toBeUndefined();
        expect(createCall.max_tokens).toBeUndefined();
        expect(createCall.messages[0].role).toBe('developer');
        expect(createCall.presence_penalty).toBeUndefined();
        expect(createCall.reasoning_effort).toBe('low');
        expect(createCall.stream).toBe(true);
        expect(createCall.stream_options).toEqual({ include_usage: true });
        expect(createCall.temperature).toBeUndefined();
        expect(createCall.top_logprobs).toBeUndefined();
        expect(createCall.top_p).toBeUndefined();

        expect(getModelPricingModule.getModelPricing).toHaveBeenCalledWith(
          'o3',
          'orvilo',
          undefined,
        );
        expect(streamsModule.OpenAIStream).toHaveBeenCalledWith(
          mockStream,
          expect.objectContaining({
            inputStartAt: expect.any(Number),
            payload: expect.objectContaining({
              apiMode: 'chat_completions',
              includeUsageRequested: true,
              model: 'o3',
              pricing: mockPricing,
              provider: 'orvilo',
            }),
          }),
        );
      });

      it('should handle multiple data chunks correctly', async () => {
        const mockStream = new ReadableStream() as any;
        vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue(mockStream);
        vi.spyOn(streamsModule, 'OpenAIStream').mockReturnValue(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('event: text\ndata: "你好！"\n\n'));
              controller.close();
            },
          }),
        );

        const result = await instance.chat({
          stream: true,
          max_tokens: 2048,
          temperature: 0.6,
          top_p: 1,
          model: 'gpt-35-turbo-16k',
          presence_penalty: 0,
          frequency_penalty: 0,
          messages: [{ role: 'user', content: '你好' }],
        });

        expect(result).toBeInstanceOf(Response);
        expect(streamsModule.OpenAIStream).toHaveBeenCalledWith(
          mockStream,
          expect.objectContaining({
            inputStartAt: expect.any(Number),
            payload: expect.objectContaining({
              model: 'gpt-35-turbo-16k',
              provider: 'azure',
            }),
          }),
        );
      });

      it('should handle non-streaming response', async () => {
        vi.spyOn(nonStreamToStreamModule, 'transformResponseToStream').mockImplementation(() => {
          return new ReadableStream();
        });
        vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue({
          choices: [],
          created: 1715516381,
          id: 'chatcmpl-non-stream',
          model: 'gpt-35-turbo-16k',
          object: 'chat.completion',
        } as any);
        // Act
        await instance.chat({
          stream: false,
          temperature: 0.6,
          model: 'gpt-35-turbo-16k',
          messages: [{ role: 'user', content: '你好' }],
        });

        // Assert
        expect(nonStreamToStreamModule.transformResponseToStream).toHaveBeenCalled();
      });
    });

    it('should handle o1 series models without streaming', async () => {
      vi.spyOn(nonStreamToStreamModule, 'transformResponseToStream').mockImplementation(() => {
        return new ReadableStream();
      });
      vi.spyOn(instance['client'].chat.completions, 'create').mockResolvedValue({
        choices: [],
        created: 1715516381,
        id: 'chatcmpl-o1',
        model: 'o1-preview',
        object: 'chat.completion',
      } as any);

      // Act
      await instance.chat({
        temperature: 0.6,
        model: 'o1-preview',
        messages: [{ role: 'user', content: '你好' }],
        stream: true,
      });

      // Assert
      expect(instance['client'].chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'o1-preview', stream: false }),
        expect.anything(),
      );
      expect(nonStreamToStreamModule.transformResponseToStream).toHaveBeenCalled();
    });

    describe('Error', () => {
      it('should return AzureBizError with DeploymentNotFound error', async () => {
        // Arrange
        const error = {
          code: 'DeploymentNotFound',
          message: 'Deployment not found',
        };

        (instance['client'].chat.completions.create as Mock).mockRejectedValue(error);

        // Act
        try {
          await instance.chat({
            messages: [{ content: 'Hello', role: 'user' }],
            model: 'text-davinci-003',
            temperature: 0,
          });
        } catch (e) {
          // Assert
          expect(e).toEqual({
            endpoint: 'https://***.openai.azure.com/openai/v1',
            error: {
              code: 'DeploymentNotFound',
              message: 'Deployment not found',
              deployId: 'text-davinci-003',
            },
            errorType: bizErrorType,
            provider: 'azure',
          });
        }
      });

      it('should return AgentRuntimeError for non-Azure errors', async () => {
        // Arrange
        const genericError = new Error('Generic Error');

        (instance['client'].chat.completions.create as Mock).mockRejectedValue(genericError);

        // Act
        try {
          await instance.chat({
            messages: [{ content: 'Hello', role: 'user' }],
            model: 'text-davinci-003',
            temperature: 0,
          });
        } catch (e) {
          // Assert
          expect(e).toEqual({
            endpoint: 'https://***.openai.azure.com/openai/v1',
            errorType: 'AgentRuntimeError',
            provider: 'azure',
            error: {
              name: genericError.name,
              cause: genericError.cause,
              message: genericError.message,
            },
          });
        }
      });
    });

    describe('DEBUG', () => {
      it('should call debugStream when DEBUG_CHAT_COMPLETION is 1', async () => {
        // Arrange
        const mockProdStream = new ReadableStream() as any;
        const mockDebugStream = new ReadableStream() as any;

        (instance['client'].chat.completions.create as Mock).mockResolvedValue({
          tee: () => [mockProdStream, mockDebugStream],
        });

        process.env.DEBUG_AZURE_CHAT_COMPLETION = '1';
        vi.spyOn(debugStreamModule, 'debugStream').mockImplementation(() => Promise.resolve());
        vi.spyOn(streamsModule, 'OpenAIStream').mockReturnValue(new ReadableStream());

        // Act
        await instance.chat({
          messages: [{ content: 'Hello', role: 'user' }],
          model: 'text-davinci-003',
          temperature: 0,
        });

        // Assert
        expect(debugStreamModule.debugStream).toHaveBeenCalled();

        // Restore
        delete process.env.DEBUG_AZURE_CHAT_COMPLETION;
      });
    });
  });
});
