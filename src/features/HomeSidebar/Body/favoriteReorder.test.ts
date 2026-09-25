import { describe, expect, it } from 'vitest';

import { favoriteReorderSwap } from './favoriteReorder';

const item = (id: string, rank: number, version = 1) => ({
  rank,
  targetId: id,
  targetType: 'task' as const,
  version,
});

describe('favoriteReorderSwap', () => {
  it('rewrites sequential ranks when moving a middle row up', () => {
    expect(
      favoriteReorderSwap([item('a', 0, 2), item('b', 0, 4), item('c', 2, 1)], 1, 'up'),
    ).toEqual({
      items: [
        { expectedVersion: 4, rank: 0, targetId: 'b', targetType: 'task' },
        { expectedVersion: 2, rank: 1, targetId: 'a', targetType: 'task' },
        { expectedVersion: 1, rank: 2, targetId: 'c', targetType: 'task' },
      ],
    });
  });

  it('returns null at the ends instead of wrapping', () => {
    const items = [item('a', 0), item('b', 1)];
    expect(favoriteReorderSwap(items, 0, 'up')).toBeNull();
    expect(favoriteReorderSwap(items, 1, 'down')).toBeNull();
  });
});
