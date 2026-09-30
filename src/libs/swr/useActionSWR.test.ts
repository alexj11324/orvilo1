/**
 * @vitest-environment happy-dom
 *
 * useActionSWR wraps non-idempotent mutations (session.createSession,
 * openNewTopicOrSaveTopic). SWR's default `onErrorRetry` would re-run a failed
 * fetcher forever (~5s exponential backoff, no cap) — each retry is another
 * server-side insert, so one dropped response turns a single tap into a stream
 * of duplicate rows. The hook must surface the error without retrying.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActionSWR } from './index';

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => null,
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useActionSWR', () => {
  it('does not fire the fetcher on mount', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 's1' });
    const { result } = renderHook(() => useActionSWR('action:nofire', fetcher));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isValidating).toBeFalsy();
  });

  it('surfaces a fetcher error without retrying the mutation', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network dropped'));
    const { result } = renderHook(() =>
      useActionSWR(`action:fails-${Math.random()}`, fetcher as any),
    );

    await act(async () => {
      await result.current.mutate().catch(() => undefined);
    });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // SWR's default backoff would have re-fired the fetcher many times across
    // several minutes of retries; none of that may happen for mutations.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);

    // A second explicit trigger (e.g. the user re-taps) still re-runs the
    // mutation — only the automatic retry is gone.
    fetcher.mockResolvedValueOnce({ id: 's1' });
    await act(async () => {
      await result.current.mutate().catch(() => undefined);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('propagates explicit action failures without replaying the fetcher', async () => {
    const fetcher = vi.fn();
    const error = new Error('action failed');
    const { result } = renderHook(() => useActionSWR('action:explicit-failure', fetcher));
    await act(async () => {
      await expect(
        result.current.mutate(Promise.reject(error), { revalidate: false }),
      ).rejects.toBe(error);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('still lets a caller opt back into retry via config', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValue({ id: 's2' });
    const { result } = renderHook(() =>
      useActionSWR(`action:retry-${Math.random()}`, fetcher as any, {
        errorRetryInterval: 10,
        shouldRetryOnError: true,
      }),
    );

    await act(async () => {
      await result.current.mutate().catch(() => undefined);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });
});
