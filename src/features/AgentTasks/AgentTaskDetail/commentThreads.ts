import type { TaskDetailActivity } from '@orvilo/types';

/**
 * Split a feed list into top-level rows plus comment replies grouped by their
 * thread root. Input order is preserved in both outputs — the caller's
 * chronological order becomes the reply order inside a thread.
 *
 * A reply whose root is missing from the list stays a top-level card rather
 * than vanishing: roots can leave the list when a feed is filtered, and the
 * reply is still real history.
 */
export const splitCommentThreads = <
  T extends Pick<TaskDetailActivity, 'id' | 'type' | 'parentCommentId'>,
>(
  items: T[],
): { repliesByParent: Map<string, T[]>; topLevel: T[] } => {
  const commentIds = new Set<string>();
  for (const item of items) {
    if (item.type === 'comment' && item.id) commentIds.add(item.id);
  }
  const repliesByParent = new Map<string, T[]>();
  const topLevel: T[] = [];
  for (const item of items) {
    const parentId = item.type === 'comment' ? item.parentCommentId : null;
    if (parentId && commentIds.has(parentId)) {
      const bucket = repliesByParent.get(parentId);
      if (bucket) {
        bucket.push(item);
      } else {
        repliesByParent.set(parentId, [item]);
      }
    } else {
      topLevel.push(item);
    }
  }
  return { repliesByParent, topLevel };
};
