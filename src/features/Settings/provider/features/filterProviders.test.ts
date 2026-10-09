import { describe, expect, it } from 'vitest';

import { filterProviders, matchesProviderKeyword } from './filterProviders';

const list = [
  { description: 'GPT models', id: 'openai', name: 'OpenAI' },
  { description: 'Claude models', id: 'anthropic', name: 'Anthropic' },
  { id: 'my-gateway' },
];

describe('filterProviders', () => {
  it('returns the same list for an empty or blank query', () => {
    expect(filterProviders(list, '')).toBe(list);
    expect(filterProviders(list, '   ')).toBe(list);
  });

  it('matches id, name and description case-insensitively', () => {
    expect(filterProviders(list, 'OPENAI').map((p) => p.id)).toEqual(['openai']);
    expect(filterProviders(list, 'claude').map((p) => p.id)).toEqual(['anthropic']);
    expect(filterProviders(list, 'gateway').map((p) => p.id)).toEqual(['my-gateway']);
  });

  it('trims the query and returns an empty list when nothing matches', () => {
    expect(filterProviders(list, '  anthropic ').map((p) => p.id)).toEqual(['anthropic']);
    expect(filterProviders(list, 'zzz')).toEqual([]);
  });

  it('exposes the single-provider predicate used by both surfaces', () => {
    expect(matchesProviderKeyword(list[2], 'gate')).toBe(true);
    expect(matchesProviderKeyword(list[2], 'openai')).toBe(false);
  });
});
