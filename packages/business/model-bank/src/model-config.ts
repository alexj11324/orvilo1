import type { AiFullModelCard, AiModelType } from 'model-bank';
import { loadModels as loadModelBankModels, ModelProvider } from 'model-bank';

interface OrviloModelConfig {
  models: AiFullModelCard[];
  planCardModels: string[];
  updatedAt?: string;
  version: number;
}

export interface OrviloModelPricingContext {
  plan: string;
  scope: 'personal';
}

export interface OrviloModelPricingOptions {
  pricingContext?: OrviloModelPricingContext;
}

const getDefaultOrviloModelConfig = (): OrviloModelConfig => ({
  models: [],
  planCardModels: [],
  version: 1,
});

const loadOrviloModelConfig = async (): Promise<OrviloModelConfig> => getDefaultOrviloModelConfig();

export const loadModels = async (_options?: OrviloModelPricingOptions) =>
  loadModelBankModels({
    providerLoaders: {
      [ModelProvider.Orvilo]: loadOrviloModels,
    },
  });

const loadOrviloModels = async (): Promise<AiFullModelCard[]> =>
  (await loadOrviloModelConfig()).models;

export const loadOrviloPlanCardModels = async (): Promise<string[]> =>
  (await loadOrviloModelConfig()).planCardModels;

export const isOrviloModelAvailable = (
  _id: string,
  _expectedType: AiModelType,
  _options?: {
    getUserEmail?: () => Promise<string | null | undefined>;
    userEmail?: string | null;
  },
): boolean => false;
