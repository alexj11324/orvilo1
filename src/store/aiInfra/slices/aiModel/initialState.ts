import { type AiModelReasoningConfig, type OrviloDefaultAiModelListItem } from 'model-bank';

export interface AIModelsState {
  aiModelLoadingIds: string[];
  builtinAiModelList: OrviloDefaultAiModelListItem[];
  /**
   * The user's per-model-instance reasoning defaults, keyed by
   * `${providerId}/${modelId}` (personal scope, cross-workspace).
   */
  modelReasoningConfigMap: Record<string, AiModelReasoningConfig | undefined>;
  /**
   * `${providerId}/${modelId}` keys with an in-flight reasoning-config save.
   */
  modelReasoningConfigUpdatingKeys: string[];
}

export const initialAIModelState: AIModelsState = {
  aiModelLoadingIds: [],
  builtinAiModelList: [],
  modelReasoningConfigMap: {},
  modelReasoningConfigUpdatingKeys: [],
};

export const modelReasoningConfigKey = (provider: string, model: string) => `${provider}/${model}`;
