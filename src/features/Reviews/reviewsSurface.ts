export type ReviewsSurface = 'detail' | 'list' | 'split';
export type ReviewsTab = 'created' | 'for-me';

export const reviewsListPath = (tab: ReviewsTab): string =>
  tab === 'created' ? '/reviews?tab=created' : '/reviews';

/** Changing queue scope always leaves a selected detail behind. */
export const reviewsTabDestination = (tab: ReviewsTab): string => reviewsListPath(tab);

export const reviewsDetailPath = (id: string, tab: ReviewsTab): string =>
  `/reviews/${encodeURIComponent(id)}${tab === 'created' ? '?tab=created' : ''}`;

/** antd-style device flags are cumulative; the lg breakpoint is the stable split boundary. */
export const reviewsIsNarrow = (lg: boolean | undefined): boolean => lg === false;

/**
 * Wide review workspaces keep the queue and selected pull request together.
 * Narrow workspaces preserve the list underneath a full-pane detail so Back
 * restores the exact queue position and tab.
 */
export const reviewsSurface = (isNarrow: boolean, detailOpen: boolean): ReviewsSurface => {
  if (!isNarrow) return 'split';
  return detailOpen ? 'detail' : 'list';
};

export type ReviewSubmitScope = 'comment-only' | 'full' | 'none';

/**
 * GitHub lets the pull request author submit a COMMENT review — only APPROVE
 * and REQUEST_CHANGES are disallowed on your own pull request.
 */
export const reviewSubmitScope = (input: {
  author?: null | string;
  reviewWritesEnabled?: boolean;
  viewerLogin?: null | string;
}): ReviewSubmitScope => {
  if (!input.reviewWritesEnabled || !input.viewerLogin) return 'none';
  return input.author && input.viewerLogin.toLowerCase() === input.author.toLowerCase()
    ? 'comment-only'
    : 'full';
};

export type ReviewBranchState = 'behind' | 'no-conflicts' | 'refs';

/**
 * mergeStateStatus answers whether GitHub can merge — a CLEAN head can still be
 * behind base when up-to-date branches are not required, so mergeable maps to
 * "no conflicts", not "up to date".
 */
export const reviewBranchState = (
  mergeStateStatus: null | string | undefined,
): ReviewBranchState => {
  if (mergeStateStatus === 'BEHIND') return 'behind';
  if (mergeStateStatus === 'CLEAN' || mergeStateStatus === 'HAS_HOOKS') return 'no-conflicts';
  return 'refs';
};
