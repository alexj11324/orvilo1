import { ModelProvider } from 'model-bank';
import type OpenAI from 'openai';

import { pruneReasoningPayload } from '../../core/contextBuilders/openai';
import { createOpenAICompatibleRuntime } from '../../core/openaiCompatibleFactory';
import type { ChatMethodOptions, ChatStreamPayload } from '../../types';
import { AgentRuntimeErrorType } from '../../types/error';
import { AgentRuntimeError } from '../../utils/createError';
import { sanitizeError } from '../../utils/sanitizeError';
import { isResponsesAPIModel, responsesAPIModels, systemToUserModels } from '../openai/modelId';

const azureSearchContextSize = process.env.OPENAI_SEARCH_CONTEXT_SIZE;

/**
 * Azure reasoning models reject sampling/penalty params (`temperature` and friends
 * 400 with "Unsupported parameter"). Matches GPT-5 and every later GPT generation —
 * GPT-6 dropped the minor version (`gpt-6-astra`) but kept the same restriction.
 *
 * Substring matching is deliberate: Azure deployment names commonly wrap the model
 * id (`prod-gpt-54`). The `[.-]`/end boundary keeps Azure's legacy `gpt-35-turbo`
 * deployment name out.
 */
const isAzureReasoningModel = (model: string) =>
  /gpt-[5-9](?:$|[.-])/.test(model) || model.includes('o1') || model.includes('o3');

const transformAzureSystemMessages = (messages: ChatStreamPayload['messages'], model: string) =>
  messages.map((message) => ({
    ...message,
    role:
      isAzureReasoningModel(model) && message.role === 'system'
        ? [...systemToUserModels].some((sub) => model.includes(sub))
          ? 'user'
          : 'developer'
        : message.role,
  }));

const appendAzureSearchTool = (
  tools: ChatStreamPayload['tools'],
  enabledSearch?: boolean,
): ChatStreamPayload['tools'] => {
  if (!enabledSearch) return tools;

  return [
    ...(tools || []),
    {
      type: 'web_search',
      ...(azureSearchContextSize && {
        search_context_size: azureSearchContextSize,
      }),
    } as any,
  ];
};

const normalizeAzureBaseURL = (value?: string) => {
  if (!value) return value;

  const url = new URL(value);
  const normalizedPathname = url.pathname.replace(/\/+$/, '');
  const hasOpenAISegment = normalizedPathname.split('/').includes('openai');

  url.pathname = hasOpenAISegment
    ? '/openai/v1'
    : `${normalizedPathname === '/' ? '' : normalizedPathname}/openai/v1`;
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
};

const maskSensitiveUrl = (url: string) => {
  const regex = /^(https:\/\/)([^.]+)(\.(?:openai\.azure\.com|cognitiveservices\.azure\.com).*)$/;

  return url.replace(regex, (_match, protocol, _subdomain, rest) => `${protocol}***${rest}`);
};

const BaseAzureOpenAI = createOpenAICompatibleRuntime({
  chatCompletion: {
    handlePayload: (payload) => {
      const {
        deploymentName,
        enabledSearch,
        model,
        preserveThinking: _preserveThinking,
        ...rest
      } = payload;
      const requestModel = deploymentName ?? model;

      if (isResponsesAPIModel(model) || enabledSearch) {
        return {
          ...rest,
          apiMode: 'responses',
          enabledSearch,
          model: requestModel,
        } as ChatStreamPayload;
      }

      const updatedMessages = transformAzureSystemMessages(payload.messages, model);
      const azureChatParams = rest as typeof rest & { logit_bias?: Record<string, number> };

      const {
        frequency_penalty,
        logit_bias,
        logprobs,
        max_tokens,
        presence_penalty,
        reasoning_effort,
        temperature,
        top_logprobs,
        top_p,
        ...otherParams
      } = azureChatParams;

      const compatibleReasoningEffort = reasoning_effort === 'minimal' ? 'low' : reasoning_effort;
      // Azure GPT-5 / o1 / o3 reasoning models reject sampling/penalty params, so we drop
      // them entirely for reasoning models and only pass them through for regular chat.
      const supportedSamplingParams = isAzureReasoningModel(model)
        ? {}
        : {
            frequency_penalty,
            logit_bias,
            logprobs,
            max_tokens,
            presence_penalty,
            temperature,
            top_logprobs,
            top_p,
          };

      return {
        ...otherParams,
        ...supportedSamplingParams,
        messages: updatedMessages as OpenAI.Chat.ChatCompletionMessageParam[],
        model: requestModel,
        reasoning_effort: compatibleReasoningEffort as 'low' | 'medium' | 'high' | undefined,
        stream: model.includes('o1') ? false : (payload.stream ?? true),
      } as any;
    },
    useResponseModels: [...responsesAPIModels],
  },
  debug: {
    chatCompletion: () => process.env.DEBUG_AZURE_CHAT_COMPLETION === '1',
    responses: () => process.env.DEBUG_AZURE_RESPONSES === '1',
  },
  provider: ModelProvider.Azure,
  responses: {
    handlePayload: (payload) => {
      const {
        deploymentName,
        enabledSearch,
        model,
        preserveThinking: _preserveThinking,
        tools,
        verbosity,
        ...rest
      } = payload;
      const requestModel = deploymentName ?? model;
      const updatedMessages = transformAzureSystemMessages(payload.messages, model);
      const azureTools = appendAzureSearchTool(tools, enabledSearch);
      const responseText = verbosity
        ? payload.text
          ? { ...payload.text, verbosity }
          : { verbosity }
        : payload.text;

      if (isAzureReasoningModel(model)) {
        const reasoning = payload.reasoning
          ? { ...payload.reasoning, summary: 'auto' }
          : { summary: 'auto' };

        return pruneReasoningPayload({
          ...rest,
          messages: updatedMessages,
          model: requestModel,
          reasoning,
          stream: payload.stream ?? true,
          text: responseText,
          tools: azureTools as any,
        } as ChatStreamPayload) as ChatStreamPayload;
      }

      return {
        ...rest,
        messages: updatedMessages,
        model: requestModel,
        text: responseText,
        tools: azureTools,
      } as ChatStreamPayload;
    },
  },
});

export class OrviloAzureOpenAI extends BaseAzureOpenAI {
  constructor(options: Record<string, any> = {}) {
    const { endpoint, ...rest } = options;
    const baseURL = normalizeAzureBaseURL(rest.baseURL ?? endpoint);

    super({
      ...rest,
      ...(baseURL ? { baseURL } : {}),
    });
  }

  async chat(payload: ChatStreamPayload, options?: ChatMethodOptions) {
    try {
      return await super.chat(payload, options);
    } catch (error) {
      throw this.attachDeploymentId(error, payload.deploymentName ?? payload.model);
    }
  }

  protected handleError(error: any) {
    let normalizedError = error as { [key: string]: any; code?: string; message?: string };

    if (!normalizedError.code) {
      normalizedError = {
        cause: normalizedError.cause,
        message: normalizedError.message,
        name: normalizedError.name,
      };
    }

    return AgentRuntimeError.chat({
      endpoint: maskSensitiveUrl(this.baseURL),
      error: sanitizeError(normalizedError),
      errorType: normalizedError.code
        ? AgentRuntimeErrorType.ProviderBizError
        : AgentRuntimeErrorType.AgentRuntimeError,
      provider: ModelProvider.Azure,
    });
  }

  /**
   * Keep DeploymentNotFound payload backwards-compatible because callers and
   * tests rely on the failed deployment/model id being present in the error body.
   */
  private attachDeploymentId(error: any, model?: string) {
    if (
      model &&
      error &&
      typeof error === 'object' &&
      error.error &&
      typeof error.error === 'object' &&
      error.error.code === 'DeploymentNotFound' &&
      !error.error.deployId
    ) {
      return {
        ...error,
        error: {
          ...error.error,
          deployId: model,
        },
      };
    }

    return error;
  }
}
