import { beforeEach, describe, expect, it } from 'vitest';

import { getPinnedPages, pinnedPagesStorageKey } from './storage';

describe('RecentlyViewed storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('drops retired pinned pages from personal storage', () => {
    const scope = { type: 'personal' } as const;
    window.localStorage.setItem(
      pinnedPagesStorageKey(scope),
      JSON.stringify([
        { id: 'community', lastVisited: 3, url: '/community' },
        { id: 'page', lastVisited: 2, url: '/page/document-id' },
        { id: 'agent', lastVisited: 1, url: '/agent/agent-id' },
      ]),
    );

    expect(getPinnedPages(scope)).toEqual([
      { id: 'agent', lastVisited: 1, url: '/agent/agent-id' },
    ]);
  });
});
