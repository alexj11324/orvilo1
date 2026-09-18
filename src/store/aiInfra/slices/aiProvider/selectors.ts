import { type AIProviderStoreState } from '@/store/aiInfra/initialState';
import { type AiProviderRuntimeConfig } from '@/types/aiProvider';

const enabledEmbeddingModelList = (s: AIProviderStoreState) => s.enabledEmbeddingModelList || [];

const enabledImageModelList = (s: AIProviderStoreState) => s.enabledImageModelList || [];

const enabledVideoModelList = (s: AIProviderStoreState) => s.enabledVideoModelList || [];

const providerConfigById =
  (id: string) =>
  (s: AIProviderStoreState): AiProviderRuntimeConfig | undefined => {
    if (!id) return undefined;

    return s.aiProviderRuntimeConfig?.[id];
  };

const isProviderHasBuiltinSearch = (provider: string) => (s: AIProviderStoreState) => {
  const config = providerConfigById(provider)(s);

  return !!config?.settings.searchMode;
};

const isProviderHasBuiltinSearchConfig = (id: string) => (s: AIProviderStoreState) => {
  const providerCfg = providerConfigById(id)(s);

  return !!providerCfg?.settings.searchMode && providerCfg?.settings.searchMode !== 'internal';
};

const isProviderEnableResponseApi = (id: string) => (s: AIProviderStoreState) => {
  const providerCfg = providerConfigById(id)(s);

  const enableResponseApi = providerCfg?.config?.enableResponseApi;

  if (typeof enableResponseApi === 'boolean') return enableResponseApi;

  return id === 'openai';
};

const isInitAiProviderRuntimeState = (s: AIProviderStoreState) => !!s.isInitAiProviderRuntimeState;

export const aiProviderSelectors = {
  enabledEmbeddingModelList,
  enabledImageModelList,
  enabledVideoModelList,
  isInitAiProviderRuntimeState,
  isProviderEnableResponseApi,
  isProviderHasBuiltinSearch,
  isProviderHasBuiltinSearchConfig,
  providerConfigById,
};
