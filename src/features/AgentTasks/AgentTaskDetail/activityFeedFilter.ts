import type { TaskActivityType } from '@orvilo/types';

export type ActivityFeedFilter = 'all' | 'comments' | 'updates';

export const matchesActivityFilter = (
  type: TaskActivityType,
  filter: ActivityFeedFilter,
): boolean => {
  if (filter === 'all') return true;
  if (filter === 'comments') return type === 'comment';
  return type !== 'comment';
};
