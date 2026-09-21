import { type ExtendParamsType, MODEL_REASONING_EXTEND_PARAMS } from 'model-bank/aiModel';

import { type AIProviderStoreState } from '@/store/aiInfra/initialState';
import { ModelSearchImplement } from '@/types/search';

const getModelCard = (model: string, provider: string) => (s: AIProviderStoreState) =>
  s.enabledAiModels?.find(
    (item) => item.id === model && (provider ? item.providerId === provider : true),
  ) || s.builtinAiModelList.find((item) => item.id === model && item.providerId === provider);

const getEnabledModelById = (id: string, provider: string) => (s: AIProviderStoreState) =>
  s.enabledAiModels?.find((i) => i.id === id && (provider ? provider === i.providerId : true));

const isModelSupportToolUse = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.abilities?.functionCall || false;
};

const isModelSupportVision = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.abilities?.vision || false;
};

const isModelSupportVideo = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.abilities?.video;
};

const isModelSupportAudio = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.abilities?.audio || false;
};

const isModelSupportImageOutput = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.abilities?.imageOutput || false;
};

const isModelSupportReasoning = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.abilities?.reasoning;
};

const isModelHasContextWindowToken =
  (id: string, provider: string) => (s: AIProviderStoreState) => {
    const model = getEnabledModelById(id, provider)(s);

    return typeof model?.contextWindowTokens === 'number';
  };

const modelContextWindowTokens = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.contextWindowTokens;
};

const modelExtendParams = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.settings?.extendParams;
};

const REASONING_EXTEND_PARAMS_SET = new Set<ExtendParamsType>(MODEL_REASONING_EXTEND_PARAMS);

/**
 * The subset of the model's extend params covered by the user-level
 * model-instance reasoning config (effort family + reasoningMode).
 */
const modelReasoningExtendParams = (id: string, provider: string) => (s: AIProviderStoreState) =>
  (modelExtendParams(id, provider)(s) ?? []).filter((param) =>
    REASONING_EXTEND_PARAMS_SET.has(param),
  );

const isModelHasReasoningExtendParams =
  (id: string, provider: string) => (s: AIProviderStoreState) =>
    modelReasoningExtendParams(id, provider)(s).length > 0;

/**
 * Whether the model exposes extend params beyond the reasoning family. The
 * reasoning family is edited through the ChatInput Effort control (user-level
 * model-instance config), so surfaces rendering a ControlsForm with
 * `hideReasoningParams` must gate on this instead of `isModelHasExtendParams`,
 * otherwise a reasoning-only model shows an empty popover.
 */
const isModelHasNonReasoningExtendParams =
  (id: string, provider: string) => (s: AIProviderStoreState) =>
    (modelExtendParams(id, provider)(s) ?? []).some(
      (param) => !REASONING_EXTEND_PARAMS_SET.has(param),
    );

const modelDisabledParams = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.settings?.disabledParams;
};

const isModelHasExtendParams = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const controls = modelExtendParams(id, provider)(s);

  return !!controls && controls.length > 0;
};

const modelBuiltinSearchImpl = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const model = getEnabledModelById(id, provider)(s);

  return model?.settings?.searchImpl;
};

const isModelHasBuiltinSearch = (id: string, provider: string) => (s: AIProviderStoreState) => {
  const searchImpl = modelBuiltinSearchImpl(id, provider)(s);

  return !!searchImpl;
};

const isModelBuiltinSearchInternal =
  (id: string, provider: string) =>
  (s: AIProviderStoreState): boolean => {
    const searchImpl = modelBuiltinSearchImpl(id, provider)(s);

    return searchImpl === ModelSearchImplement.Internal;
  };

const isModelHasBuiltinSearchConfig =
  (id: string, provider: string) => (s: AIProviderStoreState) => {
    const searchImpl = modelBuiltinSearchImpl(id, provider)(s);

    return (
      !!searchImpl &&
      [ModelSearchImplement.Tool, ModelSearchImplement.Params].includes(
        searchImpl as ModelSearchImplement,
      )
    );
  };

export const aiModelSelectors = {
  getEnabledModelById,
  getModelCard,
  isModelBuiltinSearchInternal,
  isModelHasBuiltinSearch,
  isModelHasBuiltinSearchConfig,
  isModelHasContextWindowToken,
  isModelHasExtendParams,
  isModelHasNonReasoningExtendParams,
  isModelHasReasoningExtendParams,
  isModelSupportAudio,
  isModelSupportImageOutput,
  isModelSupportReasoning,
  isModelSupportToolUse,
  isModelSupportVideo,
  isModelSupportVision,
  modelBuiltinSearchImpl,
  modelContextWindowTokens,
  modelDisabledParams,
  modelExtendParams,
  modelReasoningExtendParams,
};
