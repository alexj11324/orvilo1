import type {
  NormalizedCheckItem,
  PullRequestDetail,
  ReviewEntry,
  ReviewFile,
  ReviewThread,
  ReviewThreadComment,
} from './types';

/**
 * Identity- and generation-bound pager for `/reviews/:id` collection tails.
 *
 * Tail pages and cursors are only valid for the exact snapshot they were
 * fetched against: the workspace, the pull request, the loaded snapshot, the
 * observed head, and the viewing connection. Any change to that identity —
 * a refresh that lands new commits, a different viewer binding — makes the
 * old tails meaningless, so the whole pager is keyed by it and reset as one
 * unit instead of letting cursors from an old generation append under the
 * new one.
 */

export interface ReviewPagerScope {
  headSha: string | null;
  pullRequestId: string;
  snapshotId: string;
  viewerLogin: string | null;
  workspaceId: string | null;
}

export const reviewPagerKey = (scope: ReviewPagerScope): string =>
  [
    scope.workspaceId ?? '',
    scope.pullRequestId,
    scope.snapshotId,
    scope.headSha ?? '',
    scope.viewerLogin ?? '',
  ].join(':');

export interface ReviewPageMeta {
  endCursor: string | null;
  hasMore: boolean;
  total: number | null;
}

export interface ReviewPager {
  checks: NormalizedCheckItem[];
  comments: Record<string, ReviewThreadComment[]>;
  files: ReviewFile[];
  /** The identity + generation this pager's contents belong to. */
  key: string;
  /** Per-collection cursor/hasMore, keyed by collection or `comments:<id>`. */
  meta: Record<string, ReviewPageMeta>;
  reviews: ReviewEntry[];
  threads: ReviewThread[];
}

export const emptyReviewPager = (key: string): ReviewPager => ({
  checks: [],
  comments: {},
  files: [],
  key,
  meta: {},
  reviews: [],
  threads: [],
});

export interface ReviewPagerPage {
  collection: 'checks' | 'comments' | 'files' | 'reviews' | 'threads';
  endCursor: string | null;
  hasMore: boolean;
  items: unknown[];
  stale: boolean;
  threadId?: string;
  total: number | null;
}

/**
 * Append a fetched page. `generation` is the pager key captured when the
 * request started — a response arriving after the generation moved on is a
 * late write and returns the pager unchanged.
 */
export const applyReviewPagerPage = (
  pager: ReviewPager,
  generation: string,
  page: ReviewPagerPage,
): ReviewPager => {
  if (pager.key !== generation) return pager;
  const cursorKey = page.threadId ? `${page.collection}:${page.threadId}` : page.collection;
  const meta = {
    ...pager.meta,
    [cursorKey]: { endCursor: page.endCursor, hasMore: page.hasMore, total: page.total },
  };
  switch (page.collection) {
    case 'files': {
      return { ...pager, files: [...pager.files, ...(page.items as ReviewFile[])], meta };
    }
    case 'threads': {
      return { ...pager, threads: [...pager.threads, ...(page.items as ReviewThread[])], meta };
    }
    case 'reviews': {
      return { ...pager, reviews: [...pager.reviews, ...(page.items as ReviewEntry[])], meta };
    }
    case 'checks': {
      return {
        ...pager,
        checks: [...pager.checks, ...(page.items as NormalizedCheckItem[])],
        meta,
      };
    }
    case 'comments': {
      if (!page.threadId) return pager;
      const existing = pager.comments[page.threadId] ?? [];
      return {
        ...pager,
        comments: {
          ...pager.comments,
          [page.threadId]: [...existing, ...(page.items as ReviewThreadComment[])],
        },
        meta,
      };
    }
    default: {
      return pager;
    }
  }
};

/** The scope a pager is bound to, derived from the loaded detail snapshot. */
export const reviewPagerScope = (
  workspaceId: string | null,
  pullRequestId: string,
  pullRequest: PullRequestDetail | undefined,
): ReviewPagerScope | null =>
  pullRequest
    ? {
        headSha: pullRequest.headSha,
        pullRequestId,
        snapshotId: pullRequest.snapshotId,
        viewerLogin: pullRequest.viewerLogin,
        workspaceId,
      }
    : null;
