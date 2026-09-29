import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskProjectChange } from './useTaskProjectChange';

const mocks = vi.hoisted(() => ({
  refreshProjectDetail: vi.fn(),
  refreshProjectList: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: { updateTask: typeof mocks.updateTask }) => unknown) =>
    selector({ updateTask: mocks.updateTask }),
}));

vi.mock('@/store/project', () => ({
  useProjectStore: (
    selector: (state: {
      refreshProjectDetail: typeof mocks.refreshProjectDetail;
      refreshProjectList: typeof mocks.refreshProjectList;
    }) => unknown,
  ) =>
    selector({
      refreshProjectDetail: mocks.refreshProjectDetail,
      refreshProjectList: mocks.refreshProjectList,
    }),
}));

const renderChange = (taskId: string | null = 'T-1') =>
  renderHook(() => useTaskProjectChange({ taskId }));

describe('useTaskProjectChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateTask.mockResolvedValue(undefined);
    mocks.refreshProjectDetail.mockResolvedValue(undefined);
    mocks.refreshProjectList.mockResolvedValue(undefined);
  });

  it('writes the pick and reconciles both sides of the move', async () => {
    const { result } = renderChange();

    await act(async () => {
      await result.current.apply('proj-b', 'proj-a');
    });

    expect(mocks.updateTask).toHaveBeenCalledWith('T-1', { projectId: 'proj-b' });
    expect(mocks.refreshProjectDetail).toHaveBeenCalledWith('proj-a');
    expect(mocks.refreshProjectDetail).toHaveBeenCalledWith('proj-b');
    expect(mocks.refreshProjectList).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it('clears a project with a null write and no new-project refresh', async () => {
    const { result } = renderChange();

    await act(async () => {
      await result.current.apply(null, 'proj-a');
    });

    expect(mocks.updateTask).toHaveBeenCalledWith('T-1', { projectId: null });
    expect(mocks.refreshProjectDetail).toHaveBeenCalledTimes(1);
    expect(mocks.refreshProjectDetail).toHaveBeenCalledWith('proj-a');
  });

  it('files an unfiled task without touching a previous project catalog', async () => {
    const { result } = renderChange();

    await act(async () => {
      await result.current.apply('proj-b', undefined);
    });

    expect(mocks.updateTask).toHaveBeenCalledWith('T-1', { projectId: 'proj-b' });
    expect(mocks.refreshProjectDetail).toHaveBeenCalledTimes(1);
    expect(mocks.refreshProjectDetail).toHaveBeenCalledWith('proj-b');
  });

  it('drops a pick that arrives while a write is in flight', async () => {
    let release: (() => void) | undefined;
    mocks.updateTask.mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const { result } = renderChange();

    let first: Promise<void> | undefined;
    act(() => {
      first = result.current.apply('proj-b', 'proj-a');
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      await result.current.apply('proj-c', 'proj-a');
    });
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await first;
    });
    expect(result.current.pending).toBe(false);
  });

  it('clears pending when the write fails and stays retryable', async () => {
    mocks.updateTask.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderChange();

    await expect(
      act(async () => {
        await result.current.apply('proj-b', 'proj-a');
      }),
    ).rejects.toThrow('network down');
    expect(result.current.pending).toBe(false);
    // A failed write must not reconcile project catalogs — nothing moved.
    expect(mocks.refreshProjectDetail).not.toHaveBeenCalled();

    mocks.updateTask.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.apply('proj-b', 'proj-a');
    });
    expect(mocks.updateTask).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a task id', async () => {
    const { result } = renderChange(null);

    await act(async () => {
      await result.current.apply('proj-b', undefined);
    });

    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it('survives a project-detail refresh failure after a committed write', async () => {
    mocks.refreshProjectList.mockRejectedValueOnce(new Error('refresh failed'));
    const { result } = renderChange();

    await act(async () => {
      await result.current.apply('proj-b', 'proj-a');
    });

    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });
});
