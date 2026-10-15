import { type EnabledProviderWithModels } from '@/types/aiProvider';

import { type SimpleModelSource } from './types';

/**
 * Adapt a flat `simpleSource` into the single-provider shape the list renders.
 *
 * `title` becomes `displayName` (not `id`): the list groups rows by display
 * name, and the title is what the user is choosing between. No `releasedAt` is
 * carried, so the "new model" sort is a no-op and the source order survives.
 */
export const toSimpleEnabledList = (source: SimpleModelSource): EnabledProviderWithModels[] => [
  {
    children: source.options.map((option) => ({
      abilities: {},
      displayName: option.title,
      id: option.value,
    })),
    id: source.id,
    name: source.name,
    source: 'builtin',
  },
];

export const menuKey = (provider: string, model: string) => `${provider}-${model}`;
