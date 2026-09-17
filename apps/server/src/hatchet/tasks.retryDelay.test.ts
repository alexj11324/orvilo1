import { NonRetryableError } from '@hatchet-dev/typescript-sdk/v1';
import { describe, expect, it, vi } from 'vitest';

import { parseDeferredReplayRetryDelay, waitForDeferredReplayRetry } from './tasks';

describe('deferred replay retry delay', () => {
  it('parses the queue retryDelay as milliseconds', () => {
    expect(parseDeferredReplayRetryDelay('60000')).toBe(60_000);
    expect(parseDeferredReplayRetryDelay(undefined)).toBe(0);
  });

  it('rejects a delay that cannot fit safely inside the task execution budget', () => {
    expect(() => parseDeferredReplayRetryDelay('900000')).toThrow(NonRetryableError);
    expect(() => parseDeferredReplayRetryDelay('not-a-number')).toThrow(NonRetryableError);
  });

  it('releases the worker slot and waits only on retry attempts', async () => {
    const releaseSlot = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await waitForDeferredReplayRetry(0, '60000', releaseSlot, sleep);
    expect(releaseSlot).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
    await waitForDeferredReplayRetry(1, '60000', releaseSlot, sleep);
    expect(releaseSlot).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledExactlyOnceWith(60_000);
  });
});
