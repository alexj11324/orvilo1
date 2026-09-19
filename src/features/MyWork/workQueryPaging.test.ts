import { describe, expect, it } from 'vitest';

import { mergeWorkQueryGroups, mergeWorkQueryPage, workQueryHasMore } from './workQueryPaging';

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

describe('mergeWorkQueryGroups', () => {
  it('pages one column without shrinking the other column total', () => {
    const first = [
      { hasMore: true, key: 'todo', tasks: [{ id: 'a' }, { id: 'b' }], total: 3 },
      { hasMore: false, key: 'done', tasks: [{ id: 'z' }], total: 1 },
    ];
    const next = mergeWorkQueryGroups(first, [
      { hasMore: false, key: 'todo', tasks: [{ id: 'c' }], total: 3 },
      { hasMore: false, key: 'done', tasks: [], total: 1 },
    ]);
    expect(next.find((group) => group.key === 'todo')?.tasks.map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(next.find((group) => group.key === 'done')?.total).toBe(1);
    expect(next.find((group) => group.key === 'done')?.tasks.map((row) => row.id)).toEqual(['z']);
    expect(next.find((group) => group.key === 'todo')?.hasMore).toBe(false);
    expect(next.find((group) => group.key === 'done')?.hasMore).toBe(false);
  });
});
