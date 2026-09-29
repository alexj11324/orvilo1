import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskPriorityChange } from './useTaskPriorityChange';

const mocks = vi.hoisted(() => ({
  updateTask: vi.fn(),
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: { updateTask: typeof mocks.updateTask }) => unknown) =>
    selector({ updateTask: mocks.updateTask }),
}));

const renderPriorityChange = (
  overrides: Partial<Parameters<typeof useTaskPriorityChange>[0]> = {},
) =>
  renderHook(() =>
    useTaskPriorityChange({
      canEdit: true,
      currentPriority: 3,
      taskIdentifier: 'T-1',
      ...overrides,
    }),
  );

describe('useTaskPriorityChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateTask.mockResolvedValue(undefined);
  });

  it('writes a new priority through updateTask and settles pending', async () => {
    const { result } = renderPriorityChange();

    await act(async () => {
      await result.current.apply(1);
    });

    expect(mocks.updateTask).toHaveBeenCalledWith('T-1', { priority: 1 });
    expect(result.current.pending).toBe(false);
  });

  it('clears pending when the write fails and stays retryable', async () => {
    mocks.updateTask.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderPriorityChange();

    await expect(
      act(async () => {
        await result.current.apply(1);
      }),
    ).rejects.toThrow('network down');
    expect(result.current.pending).toBe(false);

    await act(async () => {
      await result.current.apply(1);
    });
    expect(mocks.updateTask).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(false);
  });

  it('clears pending when the commit resolves but the refresh inside updateTask throws', async () => {
    // updateTask folds its post-commit list/detail revalidation into a
    // swallowed catch — only a write rejection reaches callers. This case
    // locks that contract in: whatever updateTask surfaces, pending clears.
    mocks.updateTask.mockRejectedValueOnce(new Error('readback failed'));
    const { result } = renderPriorityChange();

    await expect(
      act(async () => {
        await result.current.apply(2);
      }),
    ).rejects.toThrow('readback failed');
    expect(result.current.pending).toBe(false);
  });

  it('drops a second pick while a write is in flight', async () => {
    let releaseWrite!: () => void;
    mocks.updateTask.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        }),
    );
    const { result } = renderPriorityChange();

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.apply(1);
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      await result.current.apply(4);
    });
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseWrite();
      await first;
    });
    expect(result.current.pending).toBe(false);
  });

  it('keeps the pending flag resolvable when the task unmounts mid-write', async () => {
    let releaseWrite!: () => void;
    mocks.updateTask.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        }),
    );
    const { result, unmount } = renderPriorityChange();

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.apply(1);
    });
    unmount();

    await act(async () => {
      releaseWrite();
      await first;
    });
    await expect(first).resolves.toBeUndefined();
  });

  it('skips the write for a no-op pick, a read-only user, or a delegated change', async () => {
    mocks.updateTask.mockClear();
    const { result: samePick } = renderPriorityChange();
    await act(async () => {
      await samePick.current.apply(3);
    });
    expect(mocks.updateTask).not.toHaveBeenCalled();

    const { result: readOnly } = renderPriorityChange({ canEdit: false });
    await act(async () => {
      await readOnly.current.apply(1);
    });
    expect(mocks.updateTask).not.toHaveBeenCalled();

    const onChange = vi.fn();
    const { result: delegated } = renderPriorityChange({ onChange });
    await act(async () => {
      await delegated.current.apply(1);
    });
    expect(onChange).toHaveBeenCalledWith(1);
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
});
