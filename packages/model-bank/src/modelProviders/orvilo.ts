import { BRANDING_NAME } from '@orvilo/business-const';

import type { ModelProviderCard } from '../types';

/**
 * The branded first-party provider. Display metadata follows the business
 * branding slot: OSS/cloud keep the Orvilo identity, while custom-branding
 * distributions (BRANDING_NAME override) get their own name and drop the
 * Orvilo marketing copy/links automatically.
 */
const isCustomBranding = BRANDING_NAME !== 'Orvilo';

const Orvilo: ModelProviderCard = {
  chatModels: [],
  ...(isCustomBranding
    ? {}
    : {
        description:
          'Orvilo Cloud uses official APIs to access AI models and measures usage with Credits tied to model tokens.',
        modelsUrl: 'https://orvilo.aspectlylabs.com/zh/docs/usage/subscription/model-pricing',
      }),
  enabled: true,
  id: 'orvilo',
  name: BRANDING_NAME,
  settings: {
    modelEditable: false,
    showAddNewModel: false,
    showModelFetcher: false,
  },
  showConfig: false,
  url: isCustomBranding ? '' : 'https://orvilo.aspectlylabs.com',
};

export default Orvilo;

export const planCardModels = [
  'deepseek-v4-pro',
  'claude-sonnet-4-6',
  'gemini-3.1-pro-preview',
  'gpt-5.5',
];
