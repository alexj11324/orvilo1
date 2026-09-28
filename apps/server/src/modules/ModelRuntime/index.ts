import { type GoogleGenAIOptions } from '@google/genai';
import {
  AgentRuntimeError,
  mergeModelRuntimeHooks,
  ModelRuntime,
  type ModelRuntimeHooks,
} from '@orvilo/model-runtime';
import { OrviloVertexAI } from '@orvilo/model-runtime/vertexai';
import { ChatErrorType, type ClientSecretPayload } from '@orvilo/types';
import { safeParseJSON } from '@orvilo/utils';
import { ModelProvider } from 'model-bank';
import { AiProviderBaseURLSchema } from 'model-bank/aiProvider';

import { getBusinessModelRuntimeHooks } from '@/business/server/model-runtime';
import { getLLMConfig } from '@/envs/llm';
import { createLLMGenerationTracingHook } from '@/server/services/llmGenerationTracing/hook';

import apiKeyManager from './apiKeyManager';

export * from './trace';

/**
 * Retrieves the options object from environment and apikeymanager
 * based on the provider and payload.
 *
 * @param provider - The model provider.
 * @param payload - The JWT payload.
 * @returns The options object.
 */
const getParamsFromPayload = (provider: string, payload: ClientSecretPayload) => {
  const llmConfig = getLLMConfig() as Record<string, any>;

  switch (provider) {
    case ModelProvider.Orvilo: {
      return { apikey: payload.apiKey, baseURL: payload.baseURL, ...payload };
    }

    case ModelProvider.VertexAI: {
      return {};
    }

    default: {
      let upperProvider = provider.toUpperCase();

      if (!(`${upperProvider}_API_KEY` in llmConfig)) {
        upperProvider = ModelProvider.OpenAI.toUpperCase(); // Use OpenAI options as default
      }

      const apiKey = apiKeyManager.pick(payload?.apiKey || llmConfig[`${upperProvider}_API_KEY`]);
      const baseURL = payload?.baseURL || process.env[`${upperProvider}_PROXY_URL`];

      return baseURL ? { apiKey, baseURL } : { apiKey };
    }

    case ModelProvider.Ollama: {
      const baseURL = payload?.baseURL || process.env.OLLAMA_PROXY_URL;

      return { baseURL };
    }

    case ModelProvider.Azure: {
      const { AZURE_API_KEY, AZURE_ENDPOINT } = llmConfig;
      const apiKey = apiKeyManager.pick(payload?.apiKey || AZURE_API_KEY);
      const baseURL = payload?.baseURL || AZURE_ENDPOINT;
      return { apiKey, baseURL };
    }

    case ModelProvider.AzureAI: {
      const { AZUREAI_ENDPOINT, AZUREAI_ENDPOINT_KEY } = llmConfig;
      const apiKey = payload?.apiKey || AZUREAI_ENDPOINT_KEY;
      const baseURL = payload?.baseURL || AZUREAI_ENDPOINT;
      return { apiKey, baseURL };
    }

    case ModelProvider.Bedrock: {
      const { AWS_SECRET_ACCESS_KEY, AWS_ACCESS_KEY_ID, AWS_REGION, AWS_SESSION_TOKEN } = llmConfig;

      const hasUserBedrockAuth = !!(
        payload.apiKey ||
        payload.awsAccessKeyId ||
        payload.awsSecretAccessKey
      );

      if (hasUserBedrockAuth) {
        return {
          accessKeyId: payload.awsAccessKeyId,
          accessKeySecret: payload.awsSecretAccessKey,
          apiKey: apiKeyManager.pick(payload.apiKey),
          region: payload.awsRegion || AWS_REGION,
          sessionToken: payload.awsSessionToken,
        };
      }

      const accessKeyId: string | undefined = AWS_ACCESS_KEY_ID;
      const accessKeySecret: string | undefined = AWS_SECRET_ACCESS_KEY;
      const region = payload.awsRegion || AWS_REGION;
      const sessionToken: string | undefined = payload.awsSessionToken || AWS_SESSION_TOKEN;

      return { accessKeyId, accessKeySecret, region, sessionToken };
    }

    case ModelProvider.Cloudflare: {
      const { CLOUDFLARE_API_KEY, CLOUDFLARE_BASE_URL_OR_ACCOUNT_ID } = llmConfig;

      const apiKey = apiKeyManager.pick(payload?.apiKey || CLOUDFLARE_API_KEY);
      const baseURLOrAccountID =
        payload.apiKey && payload.cloudflareBaseURLOrAccountID
          ? payload.cloudflareBaseURLOrAccountID
          : CLOUDFLARE_BASE_URL_OR_ACCOUNT_ID;

      return { apiKey, baseURLOrAccountID };
    }

    case ModelProvider.GithubCopilot: {
      // Support both traditional PAT (apiKey) and OAuth tokens
      return {
        apiKey: payload.apiKey,
        bearerToken: payload.bearerToken,
        bearerTokenExpiresAt: payload.bearerTokenExpiresAt,
        oauthAccessToken: payload.oauthAccessToken,
      };
    }

    case ModelProvider.SuperGrok: {
      // OAuth-only: never fall back to env API keys
      return { apiKey: payload.apiKey };
    }

    case ModelProvider.ChatGPT: {
      return {
        apiKey: payload.apiKey,
        chatgptAccountId: payload.chatgptAccountId,
      };
    }

    case ModelProvider.GiteeAI: {
      const { GITEE_AI_API_KEY } = llmConfig;

      const apiKey = apiKeyManager.pick(payload?.apiKey || GITEE_AI_API_KEY);

      return { apiKey };
    }

    case ModelProvider.Github: {
      const { GITHUB_TOKEN } = llmConfig;

      const apiKey = apiKeyManager.pick(payload?.apiKey || GITHUB_TOKEN);

      return { apiKey };
    }

    case ModelProvider.OllamaCloud: {
      const { OLLAMA_CLOUD_API_KEY } = llmConfig;

      const apiKey = apiKeyManager.pick(payload?.apiKey || OLLAMA_CLOUD_API_KEY);

      return { apiKey };
    }

    case ModelProvider.TencentCloud: {
      const { TENCENT_CLOUD_API_KEY } = llmConfig;

      const apiKey = apiKeyManager.pick(payload?.apiKey || TENCENT_CLOUD_API_KEY);

      return { apiKey };
    }
  }
};

const buildVertexOptions = (
  payload: ClientSecretPayload,
  params: Partial<GoogleGenAIOptions> = {},
): GoogleGenAIOptions => {
  const rawCredentials = payload.apiKey || process.env.VERTEXAI_CREDENTIALS || '';
  const credentials = safeParseJSON<Record<string, string>>(rawCredentials);

  const projectFromParams = params.project as string | undefined;
  const projectFromCredentials = credentials?.project_id;
  const projectFromEnv = process.env.VERTEXAI_PROJECT;

  const project = projectFromParams || projectFromCredentials || projectFromEnv;
  const location =
    (params.location as string | undefined) ||
    payload.vertexAIRegion ||
    process.env.VERTEXAI_LOCATION ||
    undefined;

  const googleAuthOptions = params.googleAuthOptions || (credentials ? { credentials } : undefined);

  const options: GoogleGenAIOptions = {
    ...params,
    vertexai: true,
  };

  if (googleAuthOptions) options.googleAuthOptions = googleAuthOptions;
  if (project) options.project = project;
  if (location) options.location = location as GoogleGenAIOptions['location'];

  return options;
};

/**
 * Initializes the agent runtime with the user payload in backend
 * @param provider - The provider name.
 * @param payload - The JWT payload.
 * @param params
 * @returns A promise that resolves when the agent runtime is initialized.
 */
export const initModelRuntimeWithUserPayload = (
  provider: string,
  payload: ClientSecretPayload,
  params: any = {},
  hooks?: ModelRuntimeHooks,
) => {
  const runtimeProvider = payload.runtimeProvider ?? provider;

  /**
   * User-configured endpoints can come from older clients or persisted rows that predate
   * input validation. Reject them before an SDK appends a request path and throws an
   * unclassified ERR_INVALID_URL, which would otherwise surface as a server-side 500.
   */
  if (payload.baseURL && !AiProviderBaseURLSchema.safeParse(payload.baseURL).success) {
    throw AgentRuntimeError.createError(ChatErrorType.BadRequest, {
      message: 'Invalid provider baseURL',
    });
  }

  if (runtimeProvider === ModelProvider.VertexAI) {
    const vertexOptions = buildVertexOptions(payload, params);
    const runtime = OrviloVertexAI.initFromVertexAI(vertexOptions);

    return new ModelRuntime(runtime, hooks);
  }

  return ModelRuntime.initializeWithProvider(
    runtimeProvider,
    {
      ...getParamsFromPayload(runtimeProvider, payload),
      ...params,
    },
    hooks,
  );
};

/**
 * Initialize ModelRuntime with deployment-owned provider configuration.
 *
 * Provider management (BYOK) is retired. User-scoped `ai_providers` rows are
 * inert history: their persisted `keyVaults`/`baseURL` must never drive a
 * server-side model call again, and a caller-invented custom provider id can
 * never resolve credentials (custom providers only ever resolved them through
 * user rows).
 *
 * Credentials therefore come from deployment-owned configuration only:
 * `{PROVIDER}_API_KEY` / `{PROVIDER}_PROXY_URL` envs inside
 * `getParamsFromPayload`, or the `ModelProvider.Orvilo` deployment relay,
 * which needs no payload at all.
 *
 * @param userId - The user ID (billing/tracing attribution)
 * @param provider - Builtin provider id (e.g. 'openai', 'orvilo')
 * @returns Promise<ModelRuntime> - The initialized ModelRuntime instance
 *
 * @example
 * ```typescript
 * const modelRuntime = await initModelRuntimeFromDeploymentConfig(userId, 'openai');
 * const response = await modelRuntime.chat({ messages, model });
 * ```
 */
export const initModelRuntimeFromDeploymentConfig = async (
  userId: string,
  provider: string,
  workspaceId?: string,
): Promise<ModelRuntime> => {
  if (!Object.values(ModelProvider).includes(provider as ModelProvider)) {
    throw AgentRuntimeError.createError(ChatErrorType.BadRequest, {
      message: `Provider '${provider}' is not a deployment-managed provider`,
    });
  }

  const payload = { runtimeProvider: provider };

  const businessHooks = getBusinessModelRuntimeHooks(userId, provider, workspaceId);
  const tracingHooks = createLLMGenerationTracingHook(userId, provider, workspaceId);
  const hooks = mergeModelRuntimeHooks(businessHooks, tracingHooks);

  return initModelRuntimeWithUserPayload(provider, payload, { userId, workspaceId }, hooks);
};
