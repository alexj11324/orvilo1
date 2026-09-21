// @vitest-environment node
import {
  ModelRuntime,
  OrviloAnthropicAI,
  OrviloAzureOpenAI,
  OrviloBedrockAI,
  OrviloComfyUI,
  OrviloDeepSeekAI,
  OrviloGoogleAI,
  OrviloGroq,
  OrviloMinimaxAI,
  OrviloMistralAI,
  OrviloMoonshotAI,
  OrviloOllamaAI,
  OrviloOpenAI,
  OrviloOpenRouterAI,
  OrviloPerplexityAI,
  OrviloQwenAI,
  OrviloStepfunAI,
  OrviloTogetherAI,
  OrviloZeroOneAI,
  OrviloZhipuAI,
} from '@orvilo/model-runtime';
import { OrviloVertexAI } from '@orvilo/model-runtime/vertexai';
import { ChatErrorType, type ClientSecretPayload } from '@orvilo/types';
import { ModelProvider } from 'model-bank';
import { describe, expect, it, vi } from 'vitest';

import { initModelRuntimeWithUserPayload } from './index';

interface InspectableBedrockRuntime {
  client: {
    config: {
      token?: () => Promise<{ token: string }>;
    };
  };
  region: string;
}

// 模拟依赖项
vi.mock('@/envs/llm', () => ({
  getLLMConfig: vi.fn(() => ({
    // 确保为每个provider提供必要的配置信息
    OPENAI_API_KEY: 'test-openai-key',
    GOOGLE_API_KEY: 'test-google-key',

    AZURE_API_KEY: 'test-azure-key',
    AZURE_ENDPOINT: 'https://test-azure.openai.azure.com',

    ZHIPU_API_KEY: 'test.zhipu-key',
    MOONSHOT_API_KEY: 'test-moonshot-key',
    AWS_SECRET_ACCESS_KEY: 'test-aws-secret',
    AWS_ACCESS_KEY_ID: 'test-aws-id',
    AWS_REGION: 'test-aws-region',
    AWS_SESSION_TOKEN: 'test-aws-session-token',
    OLLAMA_PROXY_URL: 'https://test-ollama-url.local',
    PERPLEXITY_API_KEY: 'test-perplexity-key',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    MINIMAX_API_KEY: 'test-minimax-key',
    MISTRAL_API_KEY: 'test-mistral-key',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    TOGETHERAI_API_KEY: 'test-togetherai-key',
    QINIU_API_KEY: 'test-qiniu-key',
    QWEN_API_KEY: 'test-qwen-key',
    STEPFUN_API_KEY: 'test-stepfun-key',
  })),
}));

/**
 * Test cases for function initModelRuntimeWithUserPayload
 * this method will use ModelRuntime from `@orvilo/model-runtime`
 * and method `getLlmOptionsFromPayload` to initialize runtime
 * with user payload. Test case below will test both the methods
 */
describe('initModelRuntimeWithUserPayload method', () => {
  describe('should initialize with options correctly', () => {
    it('OpenAI provider: with apikey and endpoint', async () => {
      const jwtPayload: ClientSecretPayload = {
        apiKey: 'user-openai-key',
        baseURL: 'https://user-endpoint.test/v1',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.OpenAI, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOpenAI);
      expect(runtime['_runtime'].baseURL).toBe(jwtPayload.baseURL);
    });

    it('rejects an invalid user baseURL as a bad request before SDK initialization', () => {
      let thrownError: unknown;

      try {
        initModelRuntimeWithUserPayload(ModelProvider.OpenAI, {
          apiKey: 'user-openai-key',
          baseURL: 'https://api.example.com /v1/chat/completions',
        });
      } catch (error) {
        thrownError = error;
      }

      expect(thrownError).toEqual({
        error: { message: 'Invalid provider baseURL' },
        errorType: ChatErrorType.BadRequest,
      });
    });

    it('Azure AI provider: with apikey, endpoint and apiversion', async () => {
      const jwtPayload: ClientSecretPayload = {
        apiKey: 'user-azure-key',
        baseURL: 'https://user-azure.openai.azure.com',
        azureApiVersion: '2024-06-01',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Azure, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloAzureOpenAI);
      expect(runtime['_runtime'].baseURL).toBe('https://user-azure.openai.azure.com/openai/v1');
    });

    it('Custom provider should use runtimeProvider to init', async () => {
      const jwtPayload: ClientSecretPayload = {
        apiKey: 'user-azure-key',
        azureApiVersion: '2024-06-01',
        baseURL: 'https://user-azure.openai.azure.com',
        runtimeProvider: ModelProvider.Azure,
      };
      const runtime = await initModelRuntimeWithUserPayload('custom-provider', jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloAzureOpenAI);
      expect(runtime['_runtime'].baseURL).toBe('https://user-azure.openai.azure.com/openai/v1');
    });

    it('ZhiPu AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'zhipu.user-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.ZhiPu, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloZhipuAI);
    });

    it('Google provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-google-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Google, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloGoogleAI);
    });

    it('Moonshot AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-moonshot-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Moonshot, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloMoonshotAI);
    });

    it('Qwen AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-qwen-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Qwen, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloQwenAI);
    });

    it('Vertex AI provider: with service account json', async () => {
      const credentials = {
        client_email: 'vertex@test-project.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n',
        project_id: 'test-project',
        type: 'service_account',
      };
      const payload: ClientSecretPayload = { apiKey: JSON.stringify(credentials) };
      const initSpy = vi
        .spyOn(OrviloVertexAI, 'initFromVertexAI')
        .mockImplementation((options: any) => {
          expect(options.project).toBe('test-project');
          expect(options.googleAuthOptions?.credentials?.private_key).toContain('TEST');

          return new OrviloGoogleAI({
            apiKey: 'avoid-error',
            client: {} as any,
            isVertexAi: true,
          });
        });

      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.VertexAI, payload);

      expect(initSpy).toHaveBeenCalledTimes(1);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloGoogleAI);

      initSpy.mockRestore();
    });

    it('Bedrock AI provider: with apikey, awsAccessKeyId, awsSecretAccessKey, awsRegion', async () => {
      const jwtPayload: ClientSecretPayload = {
        apiKey: 'user-bedrock-key',
        awsAccessKeyId: 'user-aws-id',
        awsSecretAccessKey: 'user-aws-secret',
        awsRegion: 'user-aws-region',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Bedrock, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloBedrockAI);
    });

    it('Bedrock AI provider: with API key only', async () => {
      const jwtPayload: ClientSecretPayload = {
        apiKey: 'user-bedrock-api-key',
        awsRegion: 'us-east-1',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Bedrock, jwtPayload);

      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloBedrockAI);
    });

    it('Bedrock AI provider: picks one API key with server key selection', async () => {
      const apiKey = 'user-bedrock-api-key-a,user-bedrock-api-key-b';
      const jwtPayload: ClientSecretPayload = {
        apiKey,
        awsRegion: 'us-east-1',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Bedrock, jwtPayload);
      const bedrockRuntime = runtime['_runtime'] as unknown as InspectableBedrockRuntime;
      const token = await bedrockRuntime.client.config.token?.();

      expect(apiKey.split(',')).toContain(token?.token);
    });

    it('Bedrock AI provider: with legacy AWS credentials only', async () => {
      const jwtPayload: ClientSecretPayload = {
        awsAccessKeyId: 'user-aws-id',
        awsSecretAccessKey: 'user-aws-secret',
        awsRegion: 'user-aws-region',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Bedrock, jwtPayload);

      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloBedrockAI);
    });

    it('Bedrock AI provider: falls back to env credentials when only region is provided', async () => {
      const jwtPayload: ClientSecretPayload = {
        awsRegion: 'custom-aws-region',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Bedrock, jwtPayload);

      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloBedrockAI);
      expect((runtime['_runtime'] as unknown as InspectableBedrockRuntime).region).toBe(
        'custom-aws-region',
      );
    });

    it('Ollama provider: with endpoint', async () => {
      const jwtPayload: ClientSecretPayload = { baseURL: 'http://user-ollama-url' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Ollama, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOllamaAI);
      expect(runtime['_runtime']['baseURL']).toEqual(jwtPayload.baseURL);
    });

    it('Perplexity AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-perplexity-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Perplexity, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloPerplexityAI);
    });

    it('Anthropic AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-anthropic-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Anthropic, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloAnthropicAI);
    });

    it('Minimax AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-minimax-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Minimax, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloMinimaxAI);
    });

    it('Mistral AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-mistral-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Mistral, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloMistralAI);
    });

    it('OpenRouter AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-openrouter-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.OpenRouter, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOpenRouterAI);
    });

    it('DeepSeek AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-deepseek-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.DeepSeek, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloDeepSeekAI);
    });

    it('Together AI provider: with apikey', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-togetherai-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.TogetherAI, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloTogetherAI);
    });

    it('ZeroOne AI provider: with apikey', async () => {
      const jwtPayload = { apiKey: 'user-zeroone-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.ZeroOne, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloZeroOneAI);
    });

    it('Groq AI provider: with apikey', async () => {
      const jwtPayload = { apiKey: 'user-zeroone-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Groq, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloGroq);
    });

    it('Stepfun AI provider: with apikey', async () => {
      const jwtPayload = { apiKey: 'user-stepfun-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Stepfun, jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloStepfunAI);
    });

    it('ComfyUI provider: with multiple auth types', async () => {
      // Test basic auth
      const basicAuthPayload: ClientSecretPayload = {
        authType: 'basic',
        username: 'test-user',
        password: 'test-pass',
        baseURL: 'http://localhost:8188',
      };
      let runtime = await initModelRuntimeWithUserPayload(ModelProvider.ComfyUI, basicAuthPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloComfyUI);
      expect(runtime['_runtime'].baseURL).toBe(basicAuthPayload.baseURL);

      // Test bearer auth
      const bearerAuthPayload: ClientSecretPayload = {
        authType: 'bearer',
        apiKey: 'test-token',
        baseURL: 'http://localhost:8188',
      };
      runtime = await initModelRuntimeWithUserPayload(ModelProvider.ComfyUI, bearerAuthPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloComfyUI);

      // Test custom auth
      const customAuthPayload: ClientSecretPayload = {
        authType: 'custom',
        customHeaders: { 'X-API-Key': 'secret123' },
        baseURL: 'http://localhost:8188',
      };
      runtime = await initModelRuntimeWithUserPayload(ModelProvider.ComfyUI, customAuthPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloComfyUI);

      // Test none auth
      const noAuthPayload: ClientSecretPayload = {
        authType: 'none',
        baseURL: 'http://localhost:8188',
      };
      runtime = await initModelRuntimeWithUserPayload(ModelProvider.ComfyUI, noAuthPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloComfyUI);
    });

    it('Unknown Provider: with apikey and endpoint, should initialize to OpenAi', async () => {
      const jwtPayload: ClientSecretPayload = {
        apiKey: 'user-unknown-key',
        baseURL: 'https://user-unknown-endpoint.test/v1',
      };
      const runtime = await initModelRuntimeWithUserPayload('unknown', jwtPayload);
      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOpenAI);
      expect(runtime['_runtime'].baseURL).toBe(jwtPayload.baseURL);
    });
  });

  describe('should initialize without some options', () => {
    it('OpenAI provider: without apikey', async () => {
      const jwtPayload: ClientSecretPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.OpenAI, jwtPayload);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOpenAI);
    });

    it('Azure AI Provider: without apikey', async () => {
      const jwtPayload: ClientSecretPayload = {
        azureApiVersion: 'test-azure-api-version',
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Azure, jwtPayload);

      expect(runtime['_runtime']).toBeInstanceOf(OrviloAzureOpenAI);
    });

    it('ZhiPu AI provider: without apikey', async () => {
      const jwtPayload: ClientSecretPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.ZhiPu, jwtPayload);

      // 假设 OrviloZhipuAI 是 ZhiPu 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloZhipuAI);
    });

    it('Google provider: without apikey', async () => {
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Google, {});

      // 假设 OrviloGoogleAI 是 Google 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloGoogleAI);
    });

    it('Moonshot AI provider: without apikey', async () => {
      const jwtPayload: ClientSecretPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Moonshot, jwtPayload);

      // 假设 OrviloMoonshotAI 是 Moonshot 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloMoonshotAI);
    });

    it('Qwen AI provider: without apikey', async () => {
      const jwtPayload: ClientSecretPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Qwen, jwtPayload);

      // 假设 OrviloQwenAI 是 Qwen 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloQwenAI);
    });

    it('Qwen AI provider: without endpoint', async () => {
      const jwtPayload: ClientSecretPayload = { apiKey: 'user-qwen-key' };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Qwen, jwtPayload);

      // 假设 OrviloQwenAI 是 Qwen 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloQwenAI);
      // endpoint 不存在，应返回 DEFAULT_BASE_URL
      expect(runtime['_runtime'].baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });

    it('Bedrock AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Bedrock, jwtPayload);

      // 假设 OrviloBedrockAI 是 Bedrock 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloBedrockAI);
    });

    it('Ollama provider: without endpoint', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Ollama, jwtPayload);

      // 假设 OrviloOllamaAI 是 Ollama 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOllamaAI);
    });

    it('Perplexity AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Perplexity, jwtPayload);

      // 假设 OrviloPerplexityAI 是 Perplexity 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloPerplexityAI);
    });

    it('Anthropic AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Anthropic, jwtPayload);

      // 假设 OrviloAnthropicAI 是 Anthropic 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloAnthropicAI);
    });

    it('Minimax AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Minimax, jwtPayload);

      // 假设 OrviloMistralAI 是 Mistral 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloMinimaxAI);
    });

    it('Mistral AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Mistral, jwtPayload);

      // 假设 OrviloMistralAI 是 Mistral 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloMistralAI);
    });

    it('OpenRouter AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.OpenRouter, jwtPayload);

      // 假设 OrviloOpenRouterAI 是 OpenRouter 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOpenRouterAI);
    });

    it('DeepSeek AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.DeepSeek, jwtPayload);

      // 假设 OrviloDeepSeekAI 是 DeepSeek 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloDeepSeekAI);
    });

    it('Stepfun AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Stepfun, jwtPayload);

      // 假设 OrviloDeepSeekAI 是 DeepSeek 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloStepfunAI);
    });

    it('Together AI provider: without apikey', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.TogetherAI, jwtPayload);

      // 假设 OrviloTogetherAI 是 TogetherAI 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloTogetherAI);
    });

    it('OpenAI provider: without apikey with OPENAI_PROXY_URL', async () => {
      process.env.OPENAI_PROXY_URL = 'https://proxy.example.com/v1';

      const jwtPayload: ClientSecretPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.OpenAI, jwtPayload);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOpenAI);
      // 应返回 OPENAI_PROXY_URL
      expect(runtime['_runtime'].baseURL).toBe('https://proxy.example.com/v1');
    });

    it('Qwen AI provider: without apiKey and endpoint with OPENAI_PROXY_URL', async () => {
      process.env.OPENAI_PROXY_URL = 'https://proxy.example.com/v1';

      const jwtPayload: ClientSecretPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.Qwen, jwtPayload);

      // 假设 OrviloQwenAI 是 Qwen 提供者的实现类
      expect(runtime['_runtime']).toBeInstanceOf(OrviloQwenAI);
      // endpoint 不存在，应返回 DEFAULT_BASE_URL
      expect(runtime['_runtime'].baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });

    it('ComfyUI provider: without user payload (using environment variables)', async () => {
      const jwtPayload: ClientSecretPayload = {};
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.ComfyUI, jwtPayload);

      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloComfyUI);
      // Should use environment variable defaults
      expect(runtime['_runtime'].baseURL).toBe('http://127.0.0.1:8000');
    });

    it('ComfyUI provider: partial payload (mixed with env vars)', async () => {
      const jwtPayload: ClientSecretPayload = {
        baseURL: 'http://custom-comfyui:8188',
        // authType, username, password will come from env vars
      };
      const runtime = await initModelRuntimeWithUserPayload(ModelProvider.ComfyUI, jwtPayload);

      expect(runtime).toBeInstanceOf(ModelRuntime);
      expect(runtime['_runtime']).toBeInstanceOf(OrviloComfyUI);
      expect(runtime['_runtime'].baseURL).toBe('http://custom-comfyui:8188');
    });

    it('Unknown Provider', async () => {
      const jwtPayload = {};
      const runtime = await initModelRuntimeWithUserPayload('unknown', jwtPayload);

      // 根据实际实现，你可能需要检查是否返回了默认的 runtime 实例，或者是否抛出了异常
      // 例如，如果默认使用 OpenAI:
      expect(runtime['_runtime']).toBeInstanceOf(OrviloOpenAI);
    });
  });
});
