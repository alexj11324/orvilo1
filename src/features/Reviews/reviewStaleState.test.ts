import { describe, expect, it } from 'vitest';

import {
  isReviewStale,
  reviewStaleKey,
  reviewStaleState,
  updateReviewStaleState,
} from './reviewStaleState';

describe('review stale identity', () => {
  it('does not carry review A stale state into review B', () => {
    const reviewA = reviewStaleKey('ws-1', 'review-a');
    const reviewB = reviewStaleKey('ws-1', 'review-b');
    const staleA = reviewStaleState(reviewA, true);

    expect(isReviewStale(staleA, reviewA)).toBe(true);
    expect(isReviewStale(staleA, reviewB)).toBe(false);
  });

  it('also isolates the same review id across workspaces', () => {
    const stale = reviewStaleState(reviewStaleKey('ws-1', 'review-a'), true);

    expect(isReviewStale(stale, reviewStaleKey('ws-2', 'review-a'))).toBe(false);
  });

  it('keeps review B blocked when an older review A refresh settles last', () => {
    const reviewA = reviewStaleKey('ws-1', 'review-a');
    const reviewB = reviewStaleKey('ws-1', 'review-b');
    const afterDrift = updateReviewStaleState(reviewStaleState(reviewA, true), reviewB, true);
    const afterOlderRefresh = updateReviewStaleState(afterDrift, reviewA, false);

    expect(isReviewStale(afterOlderRefresh, reviewA)).toBe(false);
    expect(isReviewStale(afterOlderRefresh, reviewB)).toBe(true);
  });
});
