import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FAVORITE_PAGE_SIZE,
  filterFavoritesByKeyword,
  hasMoreFavorites,
  isFavoriteReorderDownDisabled,
  isFavoriteReorderUpDisabled,
  visibleFavoriteRows,
} from './favoriteOverflow';
import { favoriteReorderSwap } from './favoriteReorder';

const item = (
  id: string,
  type: 'project' | 'savedView' | 'task' | 'team' = 'task',
  title = id,
) => ({
  rank: 0,
  targetId: id,
  targetType: type,
  title,
  version: 1,
});

describe('favorite overflow', () => {
  it('keeps the sidebar to the first page and reports leftover rows', () => {
    const items = [item('a'), item('b'), item('c'), item('d'), item('e'), item('f')];

    expect(
      visibleFavoriteRows(items, DEFAULT_FAVORITE_PAGE_SIZE).map((row) => row.targetId),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(hasMoreFavorites(items.length, DEFAULT_FAVORITE_PAGE_SIZE)).toBe(true);
    expect(hasMoreFavorites(5, DEFAULT_FAVORITE_PAGE_SIZE)).toBe(false);
  });

  it('lets the last visible row swap into overflow against the full list', () => {
    const items = [item('a'), item('b'), item('c'), item('d'), item('e'), item('f')];
    const lastVisible = DEFAULT_FAVORITE_PAGE_SIZE - 1;

    expect(isFavoriteReorderUpDisabled(0)).toBe(true);
    expect(isFavoriteReorderDownDisabled(lastVisible, items.length)).toBe(false);
    expect(isFavoriteReorderDownDisabled(items.length - 1, items.length)).toBe(true);
    expect(
      favoriteReorderSwap(items, lastVisible, 'down')?.items.map((row) => row.targetId),
    ).toEqual(['a', 'b', 'c', 'd', 'f', 'e']);
  });

  it('keeps team pins in an empty search and does not match raw target ids', () => {
    const items = [item('team-secret', 'team', 'Engineering'), item('t1', 'task', 'Ship inbox')];

    expect(
      filterFavoritesByKeyword(items, '', (row) => row.title ?? '').map((row) => row.targetType),
    ).toEqual(['team', 'task']);
    expect(
      filterFavoritesByKeyword(items, 'eng', (row) => row.title ?? '').map((row) => row.targetId),
    ).toEqual(['team-secret']);
    expect(filterFavoritesByKeyword(items, 'team-secret', (row) => row.title ?? '')).toEqual([]);
  });
});
