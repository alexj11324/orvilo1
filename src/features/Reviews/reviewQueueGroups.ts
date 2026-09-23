/**
 * `/reviews` list aggregation — queue grouping plus the `In-product
 * approvals` header count. Linear's For-you lane buckets pull requests into
 * `Ready to merge` / `Created by you`; the Created lane stays a single
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

/**
 * i18n key for each bucket — `pull-requests`/`open` reuse existing labels.
 * `as const` keeps the literal union so `t()` accepts the keys without a
 * cast (typed resources, `keySeparator: false`).
 */
export const REVIEW_QUEUE_GROUP_LABEL_KEYS = {
  'created-by-you': 'reviews.groups.createdByYou',
  'open': 'reviews.state.open',
  'pull-requests': 'reviews.pullRequests',
  'ready-to-merge': 'reviews.groups.readyToMerge',
} as const satisfies Record<ReviewQueueGroupKey, string>;

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
  // GitHub logins are case-insensitive identifiers — `author` arrives with
  // the author's chosen casing while `viewer` carries the API casing.
  const viewerLogin = params.viewer?.toLowerCase() ?? null;
  for (const item of items) {
    if (item.reviewDecision === 'APPROVED') {
      // An approved PR can be merged — including one the viewer authored.
      readyToMerge.push(item);
    } else if (viewerLogin !== null && item.author?.toLowerCase() === viewerLogin) {
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

/**
 * The `In-product approvals` header count — the aggregate its inner status
 * groups display per bucket (`total ?? tasks.length`), summed, plus external
 * (non-task) reviews which sit outside the task query's `total`. The server
 * `total` wins when present; the merged-groups sum is the fallback so
 * tail-loaded buckets still count when the contract drops `total`.
 * `undefined` until the first response lands so the header never flashes a
 * count computed from an empty first page.
 */
export const inProductReviewsCount = (params: {
  externalCount: number;
  groups: { tasks: unknown[]; total?: null | number }[];
  loaded: boolean;
  loadedTaskCount: number;
  total?: null | number;
}): number | undefined => {
  if (!params.loaded) return undefined;
  const taskTotal =
    params.total ??
    (params.groups.length > 0
      ? params.groups.reduce((sum, group) => sum + (group.total ?? group.tasks.length), 0)
      : params.loadedTaskCount);
  return taskTotal + params.externalCount;
};
