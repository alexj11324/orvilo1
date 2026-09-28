import type { EnabledAiModel, OrviloDefaultAiModelListItem } from 'model-bank';

import { type AiProviderRuntimeConfig, type EnabledProviderWithModels } from '@/types/aiProvider';

export interface AIProviderStoreState {
  aiProviderRuntimeConfig: Record<string, AiProviderRuntimeConfig>;
  builtinAiModelList: OrviloDefaultAiModelListItem[];
  enabledAiModels?: EnabledAiModel[];
  // used for select
  enabledChatModelList?: EnabledProviderWithModels[];
  isInitAiProviderRuntimeState: boolean;
}

export const initialState: AIProviderStoreState = {
  aiProviderRuntimeConfig: {},
  builtinAiModelList: [],
  isInitAiProviderRuntimeState: false,
};
