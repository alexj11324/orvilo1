'use client';

import type { HeterogeneousAgentModel } from '@orvilo/types';
import useSWR from 'swr';

import type { ConnectableProvider } from '@/features/ConnectAgent/providers';
import { heterogeneousAgentCatalogService } from '@/services/heterogeneousAgent';

import { modelDisplayLabel, selectorCapabilityFor } from './agentOptions';

export interface AgentModelOption {
  label: string;
  value: string;
}

export interface AgentModelOptions {
  error?: Error;
  loading: boolean;
  options: AgentModelOption[];
  retry: () => void;
  /** Whether the picked agent exposes a model dimension at all. */
  supported: boolean;
}

/**
 * The model step's data for one picked harness. Catalog capabilities probe the picked
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
      if (result.status === 'error') {
        const error = new Error(result.error.message);
        error.name = result.error.code;
        throw error;
      }
      return result.models;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!supported) return { loading: false, options: [], retry: () => {}, supported: false };

  return {
    error: catalog.error,
    loading: catalog.isLoading,
    options: (catalog.data ?? []).map((model: HeterogeneousAgentModel) => ({
      label: modelDisplayLabel(model),
      value: model.id,
    })),
    retry: () => void catalog.mutate(),
    supported: true,
  };
};
