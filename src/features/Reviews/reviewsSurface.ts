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
