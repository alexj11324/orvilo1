import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IssueStatusMoveTarget } from './useIssueStatusMove';
import { useIssueStatusMove } from './useIssueStatusMove';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  moveBoardMaybePickingState: vi.fn(),
  mutate: vi.fn(),
  refreshDetail: vi.fn(),
  runTask: vi.fn(),
  taskDetailMap: {} as Record<
    string,
    { dependencies?: Array<{ dependsOn: string; status?: string | null; type: string }> }
  >,
  toastError: vi.fn(),
  toastKey: vi.fn(() => 'myWork.moveConflict'),
  updateTask: vi.fn(),
}));

vi.mock('@/services/task', () => ({
  taskService: { find: mocks.find },
}));

vi.mock('@/features/MyWork/workQueryBoardMove', () => ({
  moveBoardMaybePickingState: mocks.moveBoardMaybePickingState,
  workQueryBoardMoveToastKey: mocks.toastKey,
}));

vi.mock('@/libs/swr', () => ({ mutate: mocks.mutate }));

vi.mock('@/store/task', () => ({
  useTaskStore: (
    selector: (state: {
      internal_refreshTaskDetail: typeof mocks.refreshDetail;
      runTask: typeof mocks.runTask;
      taskDetailMap: typeof mocks.taskDetailMap;
      updateTask: typeof mocks.updateTask;
    }) => unknown,
  ) =>
    selector({
      internal_refreshTaskDetail: mocks.refreshDetail,
      runTask: mocks.runTask,
      taskDetailMap: mocks.taskDetailMap,
      updateTask: mocks.updateTask,
    }),
}));

vi.mock('@/components/toast', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  toast: { error: mocks.toastError },
}));

const teamTask = (overrides: Record<string, unknown> = {}) => ({
  data: {
    domainRevision: 7,
    id: 'tsk_9',
    teamId: 'team-1',
    ...overrides,
  },
});

const target = (overrides: Partial<IssueStatusMoveTarget> = {}): IssueStatusMoveTarget => ({
  category: 'todo',
  ...overrides,
});

describe('useIssueStatusMove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue(teamTask());
    mocks.moveBoardMaybePickingState.mockResolvedValue(true);
    mocks.mutate.mockResolvedValue(undefined);
    mocks.refreshDetail.mockResolvedValue(undefined);
    mocks.runTask.mockResolvedValue({ success: true });
    mocks.taskDetailMap = {};
    mocks.updateTask.mockResolvedValue('T-9');
  });

  it('commits an exact-state pick through the shared CAS command', async () => {
    const { result } = renderHook(() => useIssueStatusMove());
    const moved = await result.current({
      taskIdentifier: 'T-9',
      target: target({ workflowStateRefId: 'tws_2' }),
    });
    expect(moved).toBe(true);
    expect(mocks.moveBoardMaybePickingState).toHaveBeenCalledWith({
      expectedDomainRevision: 7,
      groupBy: 'workflowCategory',
      targetKey: 'todo',
      targetWorkflowStateRefId: 'tws_2',
      taskId: 'tsk_9',
      teamId: 'team-1',
    });
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('unifies refresh across detail, task lists and work-query rows', async () => {
    const { result } = renderHook(() => useIssueStatusMove());
    await result.current({ taskIdentifier: 'T-9', target: target() });
    expect(mocks.refreshDetail).toHaveBeenCalledWith('T-9');
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    const matchers = mocks.mutate.mock.calls.map((call) => call[0]);
    expect(
      matchers.every(
        (matcher) => matcher(['workAttention:myWork']) === true || matcher(['task:list']) === true,
      ),
    ).toBe(true);
    expect(matchers.some((matcher) => matcher(['task:list', 'x']) === true)).toBe(true);
    expect(matchers.some((matcher) => matcher(['workAttention:reviews']) === true)).toBe(true);
  });

  it('does not refresh when the picker cancels the move', async () => {
    mocks.moveBoardMaybePickingState.mockResolvedValue(false);
    const { result } = renderHook(() => useIssueStatusMove());
    const moved = await result.current({ taskIdentifier: 'T-9', target: target() });
    expect(moved).toBe(false);
    expect(mocks.refreshDetail).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('keeps the plain category write for tasks without a team', async () => {
    mocks.find.mockResolvedValue(teamTask({ teamId: null }));
    const { result } = renderHook(() => useIssueStatusMove());
    const moved = await result.current({ taskIdentifier: 'T-9', target: target() });
    expect(moved).toBe(true);
    expect(mocks.updateTask).toHaveBeenCalledWith('T-9', { workflowCategory: 'todo' });
    expect(mocks.moveBoardMaybePickingState).not.toHaveBeenCalled();
  });

  it('surfaces the move-conflict toast and rethrows on a revision conflict', async () => {
    const conflict = { data: { code: 'CONFLICT' }, message: 'stale' };
    mocks.moveBoardMaybePickingState.mockRejectedValue(conflict);
    const { result } = renderHook(() => useIssueStatusMove());
    await expect(result.current({ taskIdentifier: 'T-9', target: target() })).rejects.toBe(
      conflict,
    );
    expect(mocks.toastKey).toHaveBeenCalledWith(conflict);
    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.refreshDetail).not.toHaveBeenCalled();
  });

  it('starts the agent when the issue enters in progress', async () => {
    mocks.find.mockResolvedValue(
      teamTask({ automationMode: null, status: 'backlog', workflowCategory: 'todo' }),
    );
    const { result } = renderHook(() => useIssueStatusMove());
    await result.current({
      taskIdentifier: 'T-9',
      target: target({ category: 'in_progress' }),
    });
    expect(mocks.runTask).toHaveBeenCalledWith('T-9');
  });

  it('does not start a run while an open blocker is still on the issue', async () => {
    mocks.find.mockResolvedValue(
      teamTask({ automationMode: null, status: 'backlog', workflowCategory: 'todo' }),
    );
    mocks.taskDetailMap = {
      'T-9': { dependencies: [{ dependsOn: 'T-1', status: 'backlog', type: 'blocks' }] },
    };
    const { result } = renderHook(() => useIssueStatusMove());
    await result.current({
      taskIdentifier: 'T-9',
      target: target({ category: 'in_progress' }),
    });
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('does not start a run for a todo move or an already running issue', async () => {
    mocks.find.mockResolvedValue(teamTask({ status: 'running', workflowCategory: 'todo' }));
    const { result } = renderHook(() => useIssueStatusMove());
    await result.current({
      taskIdentifier: 'T-9',
      target: target({ category: 'in_progress' }),
    });
    expect(mocks.runTask).not.toHaveBeenCalled();
  });

  it('reports success even when the post-write read-back fails', async () => {
    mocks.refreshDetail.mockRejectedValue(new Error('offline'));
    mocks.mutate.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useIssueStatusMove());
    const moved = await result.current({ taskIdentifier: 'T-9', target: target() });
    expect(moved).toBe(true);
  });
});
