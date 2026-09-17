import type { HeterogeneousProviderConfig } from '@orvilo/types';

import { isBuiltinEngineType, resolveOrviloEngineCliType } from '@/features/HeterogeneousAgent/engine';

export const isBuiltinOrviloProvider = (
  provider?: Pick<HeterogeneousProviderConfig, 'engine' | 'type'> | null,
): boolean => !!provider && isBuiltinEngineType(provider.type);

export const shouldShowHeterogeneousCloudConfig = (
  provider?: Pick<HeterogeneousProviderConfig, 'engine' | 'type'> | null,
): boolean =>
  !!provider &&
  (provider.type === 'claude-code' ||
    (isBuiltinEngineType(provider.type) && resolveOrviloEngineCliType(provider.engine) === 'claude-code'));

export const shouldShowPersonaEditor = (isHeterogeneous: boolean, isBuiltinEngine: boolean): boolean =>
  !isHeterogeneous || isBuiltinEngine;
