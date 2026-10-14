import type { TaskActivityType, TaskDetailActivity } from '@orvilo/types';

import { isCommentAnchorHash } from './commentActions';

export type ActivityFeedFilter = 'all' | 'comments' | 'updates';

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

/** A deep-linked comment passes through whatever the active filter is. */
export const filterActivitiesForFeed = <T extends Pick<TaskDetailActivity, 'id' | 'type'>>(
  activities: T[],
  filter: ActivityFeedFilter,
  hash: string,
): T[] =>
  activities.filter(
    (activity) =>
      matchesActivityFilter(activity.type, filter) || isLinkedCommentActivity(activity, hash),
  );
