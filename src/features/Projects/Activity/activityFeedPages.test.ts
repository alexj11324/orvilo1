import { describe, expect, it } from 'vitest';

import { activityFeedCursor, activityFeedRows } from './activityFeedPages';

describe('project activity pagination', () => {
  it('stops loading after the last page, even when the first page has a cursor', () => {
    expect(activityFeedCursor('page-2', undefined)).toBe('page-2');
    expect(activityFeedCursor('page-2', 'page-3')).toBe('page-3');
    expect(activityFeedCursor('page-2', null)).toBeUndefined();
  });

  it('keeps refreshed first-page rows once when they also occur in the loaded tail', () => {
    expect(
      activityFeedRows([{ id: 'new' }, { id: 'overlap' }], [{ id: 'overlap' }, { id: 'old' }]),
    ).toEqual([{ id: 'new' }, { id: 'overlap' }, { id: 'old' }]);
  });
});
