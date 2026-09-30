import { arrayMove } from '@dnd-kit/sortable';
import type { NavigationFavoriteTargetType } from '@orvilo/types';

export interface ReorderableFavorite {
  rank: number;
  targetId: string;
  targetType: NavigationFavoriteTargetType;
  version: number;
}

export const favoriteKey = (item: Pick<ReorderableFavorite, 'targetId' | 'targetType'>) =>
  `${item.targetType}:${item.targetId}`;

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

/** Rewrite all ranks after moving a favorite, preserving the CAS versions. */
export const favoriteReorderMove = (items: ReorderableFavorite[], from: number, to: number) => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return null;
  const next = arrayMove(items, from, to);
  return {
    items: next.map((item, rank) => ({
      expectedVersion: item.version,
      rank,
      targetId: item.targetId,
      targetType: item.targetType,
    })),
  };
};
