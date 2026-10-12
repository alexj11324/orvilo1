import { evaluateFeatureFlag } from '@/config/featureFlags';

import { getServerFeatureFlagsFromRuntimeConfig } from './index';

/**
 * Whether the built-in harness is offered to this user. It rides the
 * provider-settings flag: the harness cannot run without a model provider, so
 * a deployment that withholds one withholds the other. The client applies the
 * same rule (`isBuiltinHarnessOffered` in `src/features/HeterogeneousAgent`).
 */
export const isBuiltinHarnessOffered = async (userId?: string): Promise<boolean> => {
  const flags = await getServerFeatureFlagsFromRuntimeConfig(userId);

  return evaluateFeatureFlag(flags.provider_settings, userId) === true;
};
