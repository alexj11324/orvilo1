import { describe, expect, it } from 'vitest';

import { isWorkFavoritePinned } from './useWorkFavoriteToggle';

describe('isWorkFavoritePinned', () => {
  it('matches the typed target, not a colliding id on another type', () => {
    const items = [
      { targetId: 't1', targetType: 'task' },
      { targetId: 'p1', targetType: 'project' },
    ];
    expect(isWorkFavoritePinned(items, 'task', 't1')).toBe(true);
    expect(isWorkFavoritePinned(items, 'team', 't1')).toBe(false);
    expect(isWorkFavoritePinned(items, 'project', 'p1')).toBe(true);
    expect(isWorkFavoritePinned(undefined, 'task', 't1')).toBe(false);
    expect(isWorkFavoritePinned(items, 'task', undefined)).toBe(false);
  });
});
