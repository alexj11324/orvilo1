import { isHeterogeneousAgentModelId } from '@orvilo/const';
import type { HeterogeneousProviderConfig } from '@orvilo/types';
import { normalizeHeterogeneousProviderConfig } from '@orvilo/types';

/** Resolve runtime branding from persisted config using the existing read migration. */
export const resolveAgentRuntimeType = (
  config?: {
    agencyConfig?: {
      heterogeneousProvider?: Pick<Partial<HeterogeneousProviderConfig>, 'command' | 'type'> | null;
    } | null;
    model?: string | null;
  } | null,
): string => {
  const provider = config?.agencyConfig?.heterogeneousProvider;
  return provider
    ? normalizeHeterogeneousProviderConfig(provider as HeterogeneousProviderConfig).type
    : isHeterogeneousAgentModelId(config?.model)
      ? config.model
      : 'orvilo';
};
