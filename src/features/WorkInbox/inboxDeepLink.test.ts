import { describe, expect, it } from 'vitest';

import { inboxDeepLinkTerminal, inboxItemPath, resolveInboxDeepLink } from './inboxDeepLink';

const trpcError = (code: string, httpStatus: number) => ({
  data: { code, httpStatus },
  message: code,
});

describe('inboxDeepLinkTerminal', () => {
  it('treats malformed ids, missing rows and auth walls as terminal', () => {
    expect(inboxDeepLinkTerminal(trpcError('BAD_REQUEST', 400))).toBe(true);
    expect(inboxDeepLinkTerminal(trpcError('NOT_FOUND', 404))).toBe(true);
    expect(inboxDeepLinkTerminal(trpcError('FORBIDDEN', 403))).toBe(true);
    expect(inboxDeepLinkTerminal(trpcError('UNAUTHORIZED', 401))).toBe(true);
  });

  it('treats transient failures as retryable', () => {
    expect(inboxDeepLinkTerminal(trpcError('INTERNAL_SERVER_ERROR', 500))).toBe(false);
    expect(inboxDeepLinkTerminal(trpcError('TOO_MANY_REQUESTS', 429))).toBe(false);
    expect(inboxDeepLinkTerminal(new Error('socket hangup'))).toBe(false);
  });
});

describe('resolveInboxDeepLink', () => {
  const base = {
    error: undefined,
    fetched: undefined,
    listed: false,
    selectedId: 'n1',
    validating: false,
  };

  it('ignores the lookup entirely without a selected id', () => {
    expect(resolveInboxDeepLink({ ...base, selectedId: null })).toBe('none');
  });

  it('prefers the loaded list over any by-id state', () => {
    expect(resolveInboxDeepLink({ ...base, listed: true })).toBe('listed');
    expect(
      resolveInboxDeepLink({
        ...base,
        error: trpcError('INTERNAL_SERVER_ERROR', 500),
        listed: true,
      }),
    ).toBe('listed');
  });

  it('never drops the param while a lookup is in flight', () => {
    expect(resolveInboxDeepLink({ ...base, validating: true })).toBe('loading');
    // A cached `null` being re-confirmed is not yet proof the row is gone.
    expect(resolveInboxDeepLink({ ...base, fetched: null, validating: true })).toBe('loading');
    // A retry in flight keeps the pane on a skeleton, not a stale error.
    expect(
      resolveInboxDeepLink({
        ...base,
        error: trpcError('INTERNAL_SERVER_ERROR', 500),
        validating: true,
      }),
    ).toBe('loading');
  });

  it('resolves when the by-id fetch returns the card', () => {
    expect(resolveInboxDeepLink({ ...base, fetched: { notificationId: 'n1' } })).toBe('resolved');
    // A stale revalidation error must not beat settled data.
    expect(
      resolveInboxDeepLink({
        ...base,
        error: trpcError('INTERNAL_SERVER_ERROR', 500),
        fetched: { notificationId: 'n1' },
      }),
    ).toBe('resolved');
  });

  it('is dead when the server resolves null or the request is terminal', () => {
    expect(resolveInboxDeepLink({ ...base, fetched: null })).toBe('dead');
    expect(resolveInboxDeepLink({ ...base, error: trpcError('BAD_REQUEST', 400) })).toBe('dead');
    expect(resolveInboxDeepLink({ ...base, error: trpcError('FORBIDDEN', 403) })).toBe('dead');
  });

  it('is failed — not dead — for transient rejections so the pane can retry', () => {
    expect(resolveInboxDeepLink({ ...base, error: trpcError('INTERNAL_SERVER_ERROR', 500) })).toBe(
      'failed',
    );
    expect(resolveInboxDeepLink({ ...base, error: new Error('socket hangup') })).toBe('failed');
  });

  it('waits on an armed-but-unsettled lookup instead of dropping it', () => {
    expect(resolveInboxDeepLink(base)).toBe('loading');
  });
});

describe('inboxItemPath', () => {
  it('addresses one notification and opens the detail surface on narrow layouts', () => {
    const url = new URL(inboxItemPath('0b6f3c1e-1111-4222-8333-944455556666'), 'http://x');

    expect(url.pathname).toBe('/inbox');
    expect(url.searchParams.get('item')).toBe('0b6f3c1e-1111-4222-8333-944455556666');
    expect(url.searchParams.get('detail')).toBe('1');
  });

  it('escapes ids so they survive the round trip', () => {
    const url = new URL(inboxItemPath('a&b=c'), 'http://x');

    expect(url.searchParams.get('item')).toBe('a&b=c');
  });
});
