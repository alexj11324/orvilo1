import type { TaskActivityType, TaskDetailActivity } from '@orvilo/types';

import { isCommentAnchorHash } from './commentActions';

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

export const isLinkedCommentActivity = (
  activity: Pick<TaskDetailActivity, 'id' | 'type'>,
  hash: string,
): boolean =>
  activity.type === 'comment' && !!activity.id && isCommentAnchorHash(hash, activity.id);

/** A deep link reveals only its comment without changing the saved feed preference. */
export const filterActivitiesForFeed = <T extends Pick<TaskDetailActivity, 'id' | 'type'>>(
  activities: T[],
  filter: ActivityFeedFilter,
  hash: string,
): T[] =>
  activities.filter(
    (activity) =>
      matchesActivityFilter(activity.type, filter) || isLinkedCommentActivity(activity, hash),
  );

type FilterStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const activityFilterStorageKey = (userId: string | null | undefined) =>
  `orvilo:task-activity-filter:${userId ?? 'anonymous'}`;

const isActivityFeedFilter = (value: unknown): value is ActivityFeedFilter =>
  ACTIVITY_FEED_FILTERS.includes(value as ActivityFeedFilter);

/** Storage can be missing, blocked or throw; every failure means "All". */
export const readStoredActivityFilter = (
  userId: string | null | undefined,
  storage?: FilterStorage,
): ActivityFeedFilter => {
  try {
    const stored = (storage ?? globalThis.localStorage)?.getItem(activityFilterStorageKey(userId));
    return isActivityFeedFilter(stored) ? stored : 'all';
  } catch {
    return 'all';
  }
};

export const writeStoredActivityFilter = (
  userId: string | null | undefined,
  filter: ActivityFeedFilter,
  storage?: FilterStorage,
): void => {
  try {
    (storage ?? globalThis.localStorage)?.setItem(activityFilterStorageKey(userId), filter);
  } catch {
    // The choice just won't survive a reload.
  }
};
