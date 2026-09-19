import type { NavigationFavoriteTargetType } from '@orvilo/types';

export const DEFAULT_FAVORITE_PAGE_SIZE = 5;

export const visibleFavoriteRows = <T>(items: readonly T[], pageSize: number): T[] =>
  items.slice(0, Math.max(0, pageSize));

export const hasMoreFavorites = (itemCount: number, pageSize: number): boolean =>
  itemCount > pageSize;

export const isFavoriteReorderUpDisabled = (index: number): boolean => index <= 0;

export const isFavoriteReorderDownDisabled = (index: number, itemCount: number): boolean =>
  index >= itemCount - 1;

/** Search matches the displayed label, never a raw target id. */
export const filterFavoritesByKeyword = <
  T extends { targetId: string; targetType: NavigationFavoriteTargetType; title?: string | null },
>(
  items: readonly T[],
  keyword: string,
  labelOf: (item: T) => string,
): T[] => {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => labelOf(item).toLowerCase().includes(needle));
};
