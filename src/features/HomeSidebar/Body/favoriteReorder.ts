import type { NavigationFavoriteTargetType } from '@orvilo/types';

export interface ReorderableFavorite {
  rank: number;
  targetId: string;
  targetType: NavigationFavoriteTargetType;
  version: number;
}

/**
 * Swap two pinned rows and rewrite ranks to 0..n-1 so equal default ranks
 * still move. CAS versions travel with the pre-swap items.
 */
export const favoriteReorderSwap = (
  items: ReorderableFavorite[],
  index: number,
  direction: 'down' | 'up',
) => {
  const other = direction === 'up' ? index - 1 : index + 1;
  if (other < 0 || other >= items.length) return null;
  const current = items[index];
  const swapWith = items[other];
  if (!current || !swapWith) return null;
  const next = items.slice();
  next[index] = swapWith;
  next[other] = current;
  return {
    items: next.map((item, rank) => ({
      expectedVersion: item.version,
      rank,
      targetId: item.targetId,
      targetType: item.targetType,
    })),
  };
};
