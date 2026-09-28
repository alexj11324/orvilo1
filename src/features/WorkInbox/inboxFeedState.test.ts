import { describe, expect, it } from 'vitest';

import { INBOX_FEED_FOCUS_THROTTLE_MS, inboxFeedListMode } from './inboxFeedState';

describe('inboxFeedListMode', () => {
  it('does not treat an empty partial feed as a successful empty inbox', () => {
    expect(inboxFeedListMode({ cardCount: 0, isLoading: false, partial: true })).toBe(
      'partial-empty',
    );
  });

  it('keeps the ordinary empty state when every source loaded', () => {
    expect(inboxFeedListMode({ cardCount: 0, isLoading: false, partial: false })).toBe('empty');
  });

  it('shows cards even when a source is down', () => {
    expect(inboxFeedListMode({ cardCount: 2, isLoading: false, partial: true })).toBe('list');
  });
});

describe('INBOX_FEED_FOCUS_THROTTLE_MS', () => {
  it('refetches on the next window focus after an ACL revoke', () => {
    expect(INBOX_FEED_FOCUS_THROTTLE_MS).toBe(0);
  });
});
