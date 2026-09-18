import type { OrviloRuntimeAI } from '../BaseAI';

export type ApiType =
  | 'anthropic'
  | 'azure'
  | 'azureopenai'
  | 'bedrock'
  | 'cloudflare'
  | 'deepseek'
  | 'fal'
  | 'google'
  | 'meta'
  | 'minimax'
  | 'moonshot'
  | 'openai'
  | 'qwen'
  | 'vertexai'
  | 'volcengine'
  | 'xai'
  | 'xiaomimimo'
  | 'zhipu';

export type RuntimeClass = new (options?: any) => OrviloRuntimeAI;
