import type { BuiltinModelIdentifier, EnabledAiModel } from 'model-bank';

import {
  type AiProviderRuntimeConfig,
  type EnabledProvider,
  type EnabledProviderWithModels,
} from '@/types/aiProvider';

export interface AIProviderState {
  aiProviderRuntimeConfig: Record<string, AiProviderRuntimeConfig>;
  enabledAiModels?: EnabledAiModel[];
  enabledAiProviders?: EnabledProvider[];
  // used for select
  enabledChatModelList?: EnabledProviderWithModels[];
  enabledEmbeddingModelList?: EnabledProviderWithModels[];
  enabledImageModelList?: EnabledProviderWithModels[];
  enabledVideoModelList?: EnabledProviderWithModels[];
  hiddenBuiltinModels?: BuiltinModelIdentifier[];
  isInitAiProviderRuntimeState: boolean;
  /** Retired model id → successor id, delivered with the provider runtime state. */
  modelRedirects?: Record<string, string>;
  /** Secret-free provider → supported local agent binding capabilities. */
  providerBindingAgentTypes: Record<string, string[]>;
}

export const initialAIProviderState: AIProviderState = {
  aiProviderRuntimeConfig: {},
  isInitAiProviderRuntimeState: false,
  providerBindingAgentTypes: {},
};
