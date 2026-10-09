import type { TaskActivityType } from '@orvilo/types';

export type ActivityFeedFilter = 'all' | 'comments' | 'updates';

export const ACTIVITY_FEED_FILTERS = [
  'all',
  'comments',
  'updates',
] as const satisfies readonly ActivityFeedFilter[];

export const matchesActivityFilter = (
  type: TaskActivityType,
  filter: ActivityFeedFilter,
): boolean => {
  if (filter === 'all') return true;
  if (filter === 'comments') return type === 'comment';
  return type !== 'comment';
};

type FilterStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const activityFilterStorageKey = (userId: string | null | undefined) =>
  `orvilo:task-activity-filter:${userId ?? 'anonymous'}`;

const isActivityFeedFilter = (value: unknown): value is ActivityFeedFilter =>
  ACTIVITY_FEED_FILTERS.includes(value as ActivityFeedFilter);

/** Storage can be missing, blocked or throw; every failure means "All". */
export const readStoredActivityFilter = (
  userId: string | null | undefined,
  storage: FilterStorage | undefined = globalThis.localStorage,
): ActivityFeedFilter => {
  try {
    const stored = storage?.getItem(activityFilterStorageKey(userId));
    return isActivityFeedFilter(stored) ? stored : 'all';
  } catch {
    return 'all';
  }
};

export const writeStoredActivityFilter = (
  userId: string | null | undefined,
  filter: ActivityFeedFilter,
  storage: FilterStorage | undefined = globalThis.localStorage,
): void => {
  try {
    storage?.setItem(activityFilterStorageKey(userId), filter);
  } catch {
    // The choice just won't survive a reload.
  }
};
