import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSaveState } from './useSaveState';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
};

describe('useSaveState request ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('preserves the default legacy completion ordering for existing callers', async () => {
    const { result } = renderHook(() => useSaveState());
    const older = deferred();
    const newer = deferred();
    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.save(() => older.promise);
      b = result.current.save(() => newer.promise);
    });
    await act(async () => {
      newer.resolve();
      await b;
    });
    expect(result.current.status).toBe('saved');
    await act(async () => {
      older.reject(new Error('older failure'));
      await a;
    });
    expect(result.current.status).toBe('failed');
    expect(result.current.lastSavedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('keeps a newer success and its timestamp when the older request rejects', async () => {
    const { result } = renderHook(() => useSaveState({ latestRequestOnly: true }));
    const older = deferred();
    const newer = deferred();
    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.save(() => older.promise);
      b = result.current.save(() => newer.promise);
    });
    await act(async () => {
      newer.resolve();
      await b;
    });
    const time = result.current.lastSavedAt;
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    await act(async () => {
      older.reject(new Error('superseded'));
      await a;
    });
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toBe(time);
    // Errors still resolve (fire-and-forget callers) and retain the existing log.
    expect(console.error).toHaveBeenCalledWith('[useSaveState] save failed:', expect.any(Error));
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps saving while the newer request is pending and the older one settles by %s',
    async (settlement) => {
      const { result } = renderHook(() => useSaveState({ latestRequestOnly: true }));
      const older = deferred();
      const newer = deferred();
      let a!: Promise<void>;
      let b!: Promise<void>;
      act(() => {
        a = result.current.save(() => older.promise);
        b = result.current.save(() => newer.promise);
      });
      await act(async () => {
        if (settlement === 'resolve') older.resolve();
        else older.reject(new Error('superseded'));
        await a;
      });
      expect(result.current.status).toBe('saving');
      expect(result.current.lastSavedAt).toBeNull();
      await act(async () => {
        newer.resolve();
        await b;
      });
      expect(result.current.status).toBe('saved');
    },
  );

  it('keeps the newest failure, previous success time, and retries only its task', async () => {
    const { result } = renderHook(() => useSaveState({ latestRequestOnly: true }));
    await act(async () => {
      await result.current.save(async () => {});
    });
    const savedTime = result.current.lastSavedAt;
    const older = deferred();
    const olderTask = vi.fn(() => older.promise);
    const newestTask = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('current failure'))
      .mockResolvedValueOnce(undefined);
    let a!: Promise<void>;
    act(() => {
      a = result.current.save(olderTask);
    });
    await act(async () => {
      await result.current.save(newestTask);
    });
    await act(async () => {
      older.resolve();
      await a;
    });
    expect(result.current.status).toBe('failed');
    expect(result.current.lastSavedAt).toBe(savedTime);
    vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
    await act(async () => {
      await result.current.retry();
    });
    expect(newestTask).toHaveBeenCalledTimes(2);
    expect(olderTask).toHaveBeenCalledOnce();
    expect(result.current.status).toBe('saved');
    expect(result.current.lastSavedAt).toEqual(new Date('2026-01-01T00:02:00Z'));
  });

  it('disposes UI ownership without cancelling the task or running held callbacks again', async () => {
    const { result, unmount } = renderHook(() => useSaveState({ latestRequestOnly: true }));
    const pending = deferred();
    const task = vi.fn(() => pending.promise);
    const heldSave = result.current.save;
    const heldRetry = result.current.retry;
    let completion!: Promise<void>;
    act(() => {
      completion = heldSave(task);
    });
    unmount();
    await act(async () => {
      pending.resolve();
      await completion;
    });
    const newTask = vi.fn(async () => {});
    await heldSave(newTask);
    await heldRetry();
    expect(task).toHaveBeenCalledOnce();
    expect(newTask).not.toHaveBeenCalled();
  });

  it('keeps legacy held callbacks executable when the option is omitted', async () => {
    const { result, unmount } = renderHook(() => useSaveState());
    const heldSave = result.current.save;
    unmount();
    const task = vi.fn(async () => {});
    await heldSave(task);
    expect(task).toHaveBeenCalledOnce();
  });
});
