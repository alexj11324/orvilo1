import { describe, expect, it } from 'vitest';

import { resolveAllAgentsContentState } from './contentState';

const base = { count: 0, hasSearchResults: false, isSearching: true, isSearchLoading: false };

describe('resolveAllAgentsContentState', () => {
  it('shows the skeleton while a search is in flight', () => {
    expect(resolveAllAgentsContentState({ ...base, isSearchLoading: true })).toBe('loading');
  });

  it('gives a failed search a terminal error state instead of a permanent skeleton', () => {
    expect(resolveAllAgentsContentState({ ...base, searchError: new Error('boom') })).toBe('error');
  });

  it('keeps the error state while the failed search is being retried', () => {
    expect(
      resolveAllAgentsContentState({
        ...base,
        isSearchLoading: true,
        searchError: new Error('boom'),
      }),
    ).toBe('error');
  });

  it('ignores a search error once the keyword is cleared', () => {
    expect(
      resolveAllAgentsContentState({
        ...base,
        count: 2,
        isSearching: false,
        searchError: new Error('boom'),
      }),
    ).toBe('list');
  });

  it('distinguishes an empty result from a populated one', () => {
    expect(resolveAllAgentsContentState({ ...base, hasSearchResults: true })).toBe('empty');
    expect(resolveAllAgentsContentState({ ...base, count: 3, hasSearchResults: true })).toBe(
      'list',
    );
  });
});
