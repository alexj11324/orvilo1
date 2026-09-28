import { OrviloAnthropicAI } from '../../providers/anthropic';
import { OrviloAzureAI } from '../../providers/azureai';
import { OrviloAzureOpenAI } from '../../providers/azureOpenai';
import { OrviloBedrockAI } from '../../providers/bedrock';
import { OrviloCloudflareAI } from '../../providers/cloudflare';
import { OrviloDeepSeekAI } from '../../providers/deepseek';
import { OrviloGoogleAI } from '../../providers/google';
import { OrviloMetaAI } from '../../providers/meta';
import { OrviloMinimaxAI } from '../../providers/minimax';
import { OrviloMoonshotAI } from '../../providers/moonshot';
import { OrviloOpenAI } from '../../providers/openai';
import { OrviloQwenAI } from '../../providers/qwen';
import { OrviloVertexAI } from '../../providers/vertexai';
import { OrviloVolcengineAI } from '../../providers/volcengine';
import { OrviloXAI } from '../../providers/xai';
import { OrviloXiaomiMiMoAI } from '../../providers/xiaomimimo';
import { OrviloZhipuAI } from '../../providers/zhipu';
import type { ApiType, RuntimeClass } from './apiTypes';

export const baseRuntimeMap = {
  anthropic: OrviloAnthropicAI,
  azure: OrviloAzureAI,
  azureopenai: OrviloAzureOpenAI,
  bedrock: OrviloBedrockAI,
  cloudflare: OrviloCloudflareAI,
  deepseek: OrviloDeepSeekAI,
  google: OrviloGoogleAI,
  meta: OrviloMetaAI,
  minimax: OrviloMinimaxAI,
  moonshot: OrviloMoonshotAI,
  openai: OrviloOpenAI,
  qwen: OrviloQwenAI,
  vertexai: OrviloVertexAI,
  volcengine: OrviloVolcengineAI,
  xai: OrviloXAI,
  xiaomimimo: OrviloXiaomiMiMoAI,
  zhipu: OrviloZhipuAI,
} satisfies Record<ApiType, RuntimeClass>;
