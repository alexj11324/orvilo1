/**
 * `/reviews` list aggregation — queue grouping plus the `In-product
 * approvals` header count. Linear's For-you lane buckets pull requests into
 * `Ready to merge` / `Created by you`; the Created lane stays a single
 * `Open` list (audit D5/D6, BEHAVIORS §Group header). GitHub's merge state
 * determines whether the lead bucket can truthfully say `Ready to merge`.
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
  mergeStateStatus:
    | 'BEHIND'
    | 'BLOCKED'
    | 'CLEAN'
    | 'DIRTY'
    | 'DRAFT'
    | 'HAS_HOOKS'
    | 'UNKNOWN'
    | 'UNSTABLE'
    | null;
  number: number;
  repository: string;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  title: string;
  updatedAt: string | null;
  url: string;
}

export type ReviewQueueGroupKey = 'ready-to-merge' | 'created-by-you' | 'open' | 'pull-requests';

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
  'ready-to-merge': 'reviews.groups.readyToMerge',
  'created-by-you': 'reviews.groups.createdByYou',
  'open': 'reviews.state.open',
  'pull-requests': 'reviews.pullRequests',
} as const satisfies Record<ReviewQueueGroupKey, string>;

/**
 * For-you bucketing over GitHub's merge state, author and viewer:
 * - `ready-to-merge` — GitHub reports CLEAN or HAS_HOOKS on a non-draft PR;
 * - `created-by-you` — the item's author is the signed-in viewer. The for-me
 *   search is `author:<viewer> OR review-requested:<viewer>` (advanced
 *   search), so authored PRs reach the lane even with no pending request;
 * - `pull-requests` — everything else still waiting on a review.
 * Empty buckets are dropped so a uniform queue keeps its single header.
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
    if (
      !item.isDraft &&
      (item.mergeStateStatus === 'CLEAN' || item.mergeStateStatus === 'HAS_HOOKS')
    ) {
      readyToMerge.push(item);
    } else if (viewerLogin !== null && item.author?.toLowerCase() === viewerLogin) {
      createdByYou.push(item);
    } else {
      rest.push(item);
    }
  }

  const groups: ReviewQueueGroup<T>[] = [];
  // Reference order: `Ready to merge` leads, `Created by you` trails; the
  // awaiting-review remainder keeps its `Pull requests` label between them.
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
