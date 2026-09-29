import { describe, expect, it } from 'vitest';

import { favoriteReorderMove } from './favoriteReorder';

const item = (id: string, rank: number, version = 1) => ({
  rank,
  targetId: id,
  targetType: 'task' as const,
  version,
});

describe('favoriteReorderMove', () => {
  it('rewrites sequential ranks when moving a middle row up', () => {
    expect(favoriteReorderMove([item('a', 0, 2), item('b', 0, 4), item('c', 2, 1)], 1, 0)).toEqual({
      items: [
        { expectedVersion: 4, rank: 0, targetId: 'b', targetType: 'task' },
        { expectedVersion: 2, rank: 1, targetId: 'a', targetType: 'task' },
        { expectedVersion: 1, rank: 2, targetId: 'c', targetType: 'task' },
      ],
    });
  });

  it('returns null at the ends instead of wrapping', () => {
    const items = [item('a', 0), item('b', 1)];
    expect(favoriteReorderMove(items, 0, -1)).toBeNull();
    expect(favoriteReorderMove(items, 1, 2)).toBeNull();
  });
  it('moves a dragged row across several positions and preserves CAS versions', () => {
    expect(
      favoriteReorderMove(
        [item('a', 0, 2), item('b', 1, 4), item('c', 2, 1), item('d', 3, 5)],
        0,
        3,
      ),
    ).toEqual({
      items: [
        { expectedVersion: 4, rank: 0, targetId: 'b', targetType: 'task' },
        { expectedVersion: 1, rank: 1, targetId: 'c', targetType: 'task' },
        { expectedVersion: 5, rank: 2, targetId: 'd', targetType: 'task' },
        { expectedVersion: 2, rank: 3, targetId: 'a', targetType: 'task' },
      ],
    });
  });

  it('ignores an unchanged or invalid drop', () => {
    const items = [item('a', 0), item('b', 1)];
    expect(favoriteReorderMove(items, 0, 0)).toBeNull();
    expect(favoriteReorderMove(items, -1, 1)).toBeNull();
    expect(favoriteReorderMove(items, 1, 2)).toBeNull();
  });
});
