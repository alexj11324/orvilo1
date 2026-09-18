import { describe, expect, it } from 'vitest';

import { mergeWorkQueryPage, workQueryHasMore } from './workQueryPaging';

describe('mergeWorkQueryPage', () => {
  it('appends unseen ids and ignores duplicates', () => {
    expect(mergeWorkQueryPage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
  });
});

describe('workQueryHasMore', () => {
  it('is true only while loaded is below the unpaged total', () => {
    expect(workQueryHasMore(2, 3)).toBe(true);
    expect(workQueryHasMore(3, 3)).toBe(false);
    expect(workQueryHasMore(0, undefined)).toBe(false);
  });
});
