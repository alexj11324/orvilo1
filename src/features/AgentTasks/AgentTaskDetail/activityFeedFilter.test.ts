import { describe, expect, it } from 'vitest';

import { matchesActivityFilter } from './activityFeedFilter';

describe('matchesActivityFilter', () => {
  it('keeps comments out of the updates feed', () => {
    expect(matchesActivityFilter('comment', 'comments')).toBe(true);
    expect(matchesActivityFilter('comment', 'updates')).toBe(false);
    expect(matchesActivityFilter('property', 'updates')).toBe(true);
    expect(matchesActivityFilter('topic', 'updates')).toBe(true);
    expect(matchesActivityFilter('topic', 'all')).toBe(true);
  });
});
