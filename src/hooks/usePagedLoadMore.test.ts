import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePagedLoadMore } from './usePagedLoadMore';

describe('usePagedLoadMore', () => {
  it('keeps loadMoreError empty while attempts succeed', async () => {
    const { result } = renderHook(() => usePagedLoadMore());
    const attempt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await act(async () => result.current.runLoadMore(attempt));

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(result.current.loadMoreError).toBeUndefined();
  });

  it('surfaces a rejected attempt as loadMoreError instead of an unhandled rejection', async () => {
    const { result } = renderHook(() => usePagedLoadMore());
    const failure = new Error('tail page failed');

    await act(async () => result.current.runLoadMore(() => Promise.reject(failure)));

    await waitFor(() => expect(result.current.loadMoreError).toBe(failure));
  });

  it('retries the exact attempt that failed', async () => {
    const { result } = renderHook(() => usePagedLoadMore());
    const attempt = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined);

    await act(async () => result.current.runLoadMore(attempt));
    await waitFor(() => expect(result.current.loadMoreError).toBeDefined());
    expect(attempt).toHaveBeenCalledTimes(1);

    await act(async () => result.current.retryLoadMore());
    await waitFor(() => expect(result.current.loadMoreError).toBeUndefined());
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('targets the most recent attempt, not an earlier failure', async () => {
    const { result } = renderHook(() => usePagedLoadMore());
    const stale = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('old'));
    const latest = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('tail'))
      .mockResolvedValue(undefined);

    await act(async () => result.current.runLoadMore(stale));
    await waitFor(() => expect(result.current.loadMoreError).toBeDefined());

    // The next click replaces the retry target even while an error shows.
    await act(async () => result.current.runLoadMore(latest));
    await waitFor(() => expect(result.current.loadMoreError).toBeDefined());

    await act(async () => result.current.retryLoadMore());
    await waitFor(() => expect(result.current.loadMoreError).toBeUndefined());
    expect(stale).toHaveBeenCalledTimes(1);
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it('clears the error slot on resetLoadMoreError (scope change)', async () => {
    const { result } = renderHook(() => usePagedLoadMore());

    await act(async () => result.current.runLoadMore(() => Promise.reject(new Error('stale'))));
    await waitFor(() => expect(result.current.loadMoreError).toBeDefined());

    act(() => result.current.resetLoadMoreError());
    expect(result.current.loadMoreError).toBeUndefined();

    // Nothing recorded → retry is a no-op, not a stale re-fetch.
    act(() => result.current.retryLoadMore());
    expect(result.current.loadMoreError).toBeUndefined();
  });

  it('scopes a rejected group attempt to its own key', async () => {
    const { result } = renderHook(() => usePagedLoadMore());
    const failure = new Error('group page failed');

    await act(async () => result.current.runLoadMoreGroup('done', () => Promise.reject(failure)));
    await act(async () => result.current.runLoadMoreGroup('backlog', () => Promise.resolve()));

    await waitFor(() => expect(result.current.loadMoreGroupErrors.done).toBe(failure));
    expect(result.current.loadMoreGroupErrors.backlog).toBeUndefined();
    expect(result.current.loadMoreError).toBeUndefined();
  });

  it('retries only the group that failed', async () => {
    const { result } = renderHook(() => usePagedLoadMore());
    const failed = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined);
    const other = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    await act(async () => result.current.runLoadMoreGroup('done', failed));
    await waitFor(() => expect(result.current.loadMoreGroupErrors.done).toBeDefined());
    await act(async () => result.current.runLoadMoreGroup('backlog', other));

    await act(async () => result.current.retryLoadMoreGroup('done'));
    await waitFor(() => expect(result.current.loadMoreGroupErrors.done).toBeUndefined());
    expect(failed).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('clears group slots on resetLoadMoreError', async () => {
    const { result } = renderHook(() => usePagedLoadMore());

    await act(async () =>
      result.current.runLoadMoreGroup('done', () => Promise.reject(new Error('stale'))),
    );
    await waitFor(() => expect(result.current.loadMoreGroupErrors.done).toBeDefined());

    act(() => result.current.resetLoadMoreError());
    expect(result.current.loadMoreGroupErrors).toEqual({});

    // Nothing recorded → retry is a no-op, not a stale re-fetch.
    act(() => result.current.retryLoadMoreGroup('done'));
    expect(result.current.loadMoreGroupErrors).toEqual({});
  });
});
