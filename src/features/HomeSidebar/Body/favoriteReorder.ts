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
