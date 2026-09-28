import { describe, expect, it } from 'vitest';

import { buildTeamMenuEntries } from './teamMenu';

describe('buildTeamMenuEntries', () => {
  it('offers pin then copy-link for an unpinned team', () => {
    const entries = buildTeamMenuEntries(false);

    expect(entries.map((entry) => entry.key)).toEqual(['favorite', 'copyLink']);
    expect(entries[0].labelKey).toBe('savedViews.favorite');
    expect(entries[1].labelKey).toBe('savedViews.copyLink');
  });

  it('flips the favorite entry to unpin when the team is already pinned', () => {
    const entries = buildTeamMenuEntries(true);

    expect(entries.map((entry) => entry.key)).toEqual(['favorite', 'copyLink']);
    expect(entries[0].labelKey).toBe('savedViews.unfavorite');
  });
});
