'use client';

import type { HeterogeneousAgentModel } from '@orvilo/types';
import useSWR from 'swr';

import { getStaticModelOptions } from '@/features/ChatInput/ControlBar/HeteroModel/modelOptions';
import type { ConnectableProvider } from '@/features/ConnectAgent/providers';
import { heterogeneousAgentCatalogService } from '@/services/heterogeneousAgent';

import { modelDisplayLabel, selectorCapabilityFor } from './agentOptions';

export interface AgentModelOption {
  label: string;
  value: string;
}

export interface AgentModelOptions {
  /** Catalog finished with no rows. The picker still offers Default. */
  discoveryFailed: boolean;
  error?: Error;
  loading: boolean;
  options: AgentModelOption[];
  retry: () => void;
  /** Whether the picked agent exposes a model dimension at all. */
  supported: boolean;
}

/**
 * The model step's data for one picked harness. `static` capabilities answer
 * from the bundled alias table; `catalog` capabilities probe the picked
 * agent's CLI on the resolved host — the same transport the composer's model
 * selector uses, so a model this page offers is a model the run can serve.
 */
export const useAgentModelOptions = ({
  deviceId,
  enabled,
  isLocal,
  provider,
}: {
  deviceId?: string;
  enabled: boolean;
  isLocal: boolean;
  provider?: ConnectableProvider;
}): AgentModelOptions => {
  const capability = selectorCapabilityFor(provider?.type).model;
  const supported = enabled && !!capability;

  const catalog = useSWR(
    supported && capability?.source === 'catalog' && provider
      ? [
          'create-agent-model-catalog',
          provider.type,
          isLocal ? 'local' : (deviceId ?? ''),
          provider.command ?? '',
        ]
      : null,
    async () => {
      const result = await heterogeneousAgentCatalogService.listModels({
        command: provider?.command,
        deviceId: isLocal ? undefined : deviceId,
        type: provider!.type as Parameters<
          typeof heterogeneousAgentCatalogService.listModels
        >[0]['type'],
      });
      if (result.status === 'error') return [];
      return result.models;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!supported)
    return {
      discoveryFailed: false,
      loading: false,
      options: [],
      retry: () => {},
      supported: false,
    };

  if (capability?.source === 'static') {
    return {
      discoveryFailed: false,
      loading: false,
      options: getStaticModelOptions(provider?.type).map((option) => ({
        label: option.label,
        value: option.value,
      })),
      retry: () => {},
      supported: true,
    };
  }

  const models = catalog.data ?? [];
  return {
    discoveryFailed: !catalog.isLoading && !catalog.error && models.length === 0,
    error: catalog.error,
    loading: catalog.isLoading,
    options: models.map((model: HeterogeneousAgentModel) => ({
      label: modelDisplayLabel(model),
      value: model.id,
    })),
    retry: () => void catalog.mutate(),
    supported: true,
  };
};
