/**
 * `/reviews` queue grouping — Linear's For-you lane buckets pull requests
 * into `Ready to merge` / `Created by you`; the Created lane stays a single
 * `Open` list (audit D5/D6, BEHAVIORS §Group header).
 */

export type ReviewQueueTab = 'created' | 'for-me';

/** One row of the `/reviews` pull-request queue. */
export interface ReviewQueueItem {
  additions: number;
  author: string | null;
  authorAvatar: string | null;
  changedFiles: number;
  deletions: number;
  id: string;
  isDraft: boolean;
  number: number;
  repository: string;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  title: string;
  updatedAt: string | null;
  url: string;
}

export type ReviewQueueGroupKey = 'created-by-you' | 'open' | 'pull-requests' | 'ready-to-merge';

export interface ReviewQueueGroup<T extends ReviewQueueItem = ReviewQueueItem> {
  items: T[];
  key: ReviewQueueGroupKey;
}

/** i18n key for each bucket — `pull-requests`/`open` reuse existing labels. */
export const REVIEW_QUEUE_GROUP_LABEL_KEYS: Record<ReviewQueueGroupKey, string> = {
  'created-by-you': 'reviews.groups.createdByYou',
  'open': 'reviews.state.open',
  'pull-requests': 'reviews.pullRequests',
  'ready-to-merge': 'reviews.groups.readyToMerge',
};

/**
 * Best derivable mapping onto the For-you buckets from the existing queue
 * payload (`reviewDecision` + `author` + the top-level `viewer` login):
 * - `ready-to-merge` — the PR carries an APPROVED review decision, the
 *   strongest mergeable signal this payload has (check rollup is only loaded
 *   on the detail surface);
 * - `created-by-you` — the item's author is the signed-in viewer;
 * - `pull-requests` — everything else still waiting on a review.
 * Empty buckets are dropped so a uniform queue keeps its single header.
 *
 * Known contract gap: the for-me search is `review-requested:<viewer>` only,
 * so authored PRs without a pending review request never reach this lane —
 * Linear's full For-you aggregation needs a merged author ∪ review-requested
 * query plus mergeable/check fields on the item (audit D5, spec §Remaining
 * gaps).
 */
export const reviewQueueGroups = <T extends ReviewQueueItem>(
  items: T[],
  params: { tab: ReviewQueueTab; viewer: string | null },
): ReviewQueueGroup<T>[] => {
  if (items.length === 0) return [];
  if (params.tab === 'created') return [{ items, key: 'open' }];

  const readyToMerge: T[] = [];
  const createdByYou: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    if (item.reviewDecision === 'APPROVED') {
      // An approved PR can be merged — including one the viewer authored.
      readyToMerge.push(item);
    } else if (params.viewer !== null && item.author === params.viewer) {
      createdByYou.push(item);
    } else {
      rest.push(item);
    }
  }

  const groups: ReviewQueueGroup<T>[] = [];
  // Reference order: `Ready to merge` leads, `Created by you` trails; the
  // review-requested remainder keeps its `Pull requests` label between them.
  if (readyToMerge.length > 0) groups.push({ items: readyToMerge, key: 'ready-to-merge' });
  if (rest.length > 0) groups.push({ items: rest, key: 'pull-requests' });
  if (createdByYou.length > 0) groups.push({ items: createdByYou, key: 'created-by-you' });
  return groups;
};
