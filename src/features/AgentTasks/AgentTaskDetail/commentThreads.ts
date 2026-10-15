import type { TaskDetailActivity } from '@orvilo/types';

/**
 * Split a feed list into top-level rows plus comment replies grouped by the
 * thread root they render under. Input order is preserved in both outputs —
 * the caller's chronological order becomes the reply order inside a thread.
 *
 * A reply threads under its topmost ancestor still in the list: a reply to a
 * reply lands on the thread root (the same normalization the write model
 * applies), and a reply whose chain leaves the list nests under its nearest
 * remaining ancestor — or stays a top-level card when none remains. Roots can
 * leave the list when a feed is filtered, and a reply is still real history.
 */
export const splitCommentThreads = <
  T extends Pick<TaskDetailActivity, 'id' | 'type' | 'parentCommentId'>,
>(
  items: T[],
): { repliesByParent: Map<string, T[]>; topLevel: T[] } => {
  const commentById = new Map<string, T>();
  for (const item of items) {
    if (item.type === 'comment' && item.id) commentById.set(item.id, item);
  }
  const threadRoot = (item: T): T | null => {
    if (item.type !== 'comment' || !item.parentCommentId) return null;
    // `seen` guards a pathological parent cycle: bail with what was found.
    const seen = new Set<string>(item.id ? [item.id] : []);
    let root = item;
    let parentId: string | null | undefined = item.parentCommentId;
    while (parentId) {
      const parent = commentById.get(parentId);
      if (!parent || (parent.id && seen.has(parent.id))) break;
      if (parent.id) seen.add(parent.id);
      root = parent;
      parentId = parent.parentCommentId;
    }
    return root === item ? null : root;
  };
  const repliesByParent = new Map<string, T[]>();
  const topLevel: T[] = [];
  for (const item of items) {
    const rootId = threadRoot(item)?.id;
    if (rootId) {
      const bucket = repliesByParent.get(rootId);
      if (bucket) {
        bucket.push(item);
      } else {
        repliesByParent.set(rootId, [item]);
      }
    } else {
      topLevel.push(item);
    }
  }
  return { repliesByParent, topLevel };
};
