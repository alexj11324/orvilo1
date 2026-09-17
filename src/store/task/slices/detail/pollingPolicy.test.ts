import { describe, expect, it } from 'vitest';

import { resolveTaskDetailPolling } from './pollingPolicy';

describe('resolveTaskDetailPolling', () => {
  it('uses a dedupe window that covers the active refresh cadence', () => {
    expect(resolveTaskDetailPolling(true, true)).toEqual({
      dedupingInterval: 10_000,
      refreshInterval: 10_000,
    });
  });

  it('uses the idle cadence as its dedupe window', () => {
    expect(resolveTaskDetailPolling(true, false)).toEqual({
      dedupingInterval: 15_000,
      refreshInterval: 15_000,
    });
  });

  it('disables polling without a mounted task', () => {
    expect(resolveTaskDetailPolling(false, false)).toEqual({
      dedupingInterval: 0,
      refreshInterval: 0,
    });
  });
});
