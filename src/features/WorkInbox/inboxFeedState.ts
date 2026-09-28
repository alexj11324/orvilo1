/**
 * Window focus must refetch Inbox so a revoked ACL does not keep a cached title.
 * The shared client SWR hook otherwise throttles focus to five minutes.
 */
export const INBOX_FEED_FOCUS_THROTTLE_MS = 0;

export const inboxFeedListMode = (input: {
  cardCount: number;
  isLoading: boolean;
  partial: boolean;
}): 'empty' | 'list' | 'loading' | 'partial-empty' => {
  if (input.isLoading && input.cardCount === 0) return 'loading';
  if (input.cardCount === 0) return input.partial ? 'partial-empty' : 'empty';
  return 'list';
};
