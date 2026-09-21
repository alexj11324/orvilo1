// @vitest-environment node

import { vi } from 'vitest';

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
