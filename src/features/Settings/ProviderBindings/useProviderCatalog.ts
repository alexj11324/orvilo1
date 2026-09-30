import type { ModelProviderCard } from 'model-bank';
import { useMemo } from 'react';

import { useClientDataSWR } from '@/libs/swr';
import { useProviderBindingStore } from '@/store/providerBinding';

export interface ProviderCardMeta {
  apiKeyUrl?: string;
  checkModel?: string;
  description?: string;
  endpointPlaceholder?: string;
  id: string;
  name: string;
  /** Not in the model-bank catalog — synthesized from a saved binding. */
  synthetic?: boolean;
  url?: string;
}

const proxyPlaceholder = (
  proxyUrl: ModelProviderCard['proxyUrl'] | ModelProviderCard['settings']['proxyUrl'],
) => (proxyUrl === false || !proxyUrl ? undefined : proxyUrl.placeholder);

const toMeta = (card: ModelProviderCard): ProviderCardMeta => ({
  apiKeyUrl: card.apiKeyUrl,
  checkModel: card.checkModel,
  description: card.description,
  endpointPlaceholder: proxyPlaceholder(card.settings?.proxyUrl) ?? proxyPlaceholder(card.proxyUrl),
  id: card.id,
  name: card.name,
  url: card.url,
});

export function useProviderCatalog() {
  const { data, error, isLoading } = useClientDataSWR<ModelProviderCard[]>(
    'providerBinding:catalog',
    async () => {
      const { DEFAULT_MODEL_PROVIDER_LIST } = await import('model-bank/modelProviders');
      return DEFAULT_MODEL_PROVIDER_LIST;
    },
  );

  const bindings = useProviderBindingStore((s) => s.bindings);

  const cards = useMemo<ProviderCardMeta[]>(() => {
    const catalog = (data ?? []).filter((card) => card.enabled).map(toMeta);
    const covered = new Set(catalog.map((card) => card.id));
    const bound = [...new Set(bindings.map((binding) => binding.provider))];
    const boundSet = new Set(bound);
    const extras = bound
      .filter((id) => !covered.has(id))
      .map((id) => ({ id, name: id, synthetic: true }));
    return [...catalog, ...extras].sort(
      (a, b) => Number(boundSet.has(b.id)) - Number(boundSet.has(a.id)),
    );
  }, [data, bindings]);

  return { cards, error, isLoading };
}
