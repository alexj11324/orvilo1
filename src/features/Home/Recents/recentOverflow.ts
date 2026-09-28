import type { NavigationFavoriteTargetType, RecentItem } from '@orvilo/types';

export const isRecentItemManageable = (type: RecentItem['type']) =>
  type === 'document' || type === 'task' || type === 'topic';

export const recentPinTargetType = (
  type: RecentItem['type'],
): NavigationFavoriteTargetType | undefined => {
  switch (type) {
    case 'project':
    case 'savedView':
    case 'task':
    case 'team': {
      return type;
    }
    default: {
      return undefined;
    }
  }
};

export const recentItemHasOverflowMenu = (
  type: RecentItem['type'],
  options: { transferItemCount?: number } = {},
) =>
  isRecentItemManageable(type) ||
  Boolean(recentPinTargetType(type)) ||
  (options.transferItemCount ?? 0) > 0;
