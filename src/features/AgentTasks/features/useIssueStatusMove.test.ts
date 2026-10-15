import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IssueStatusMoveTarget } from './useIssueStatusMove';
import { useIssueStatusMove } from './useIssueStatusMove';

const mocks = vi.hoisted(() => ({
  confirmModal: vi.fn(),
  contractContext: vi.fn(),
  find: vi.fn(),
  moveBoardMaybePickingState: vi.fn(),
  mutate: vi.fn(),
  refreshDetail: vi.fn(),
  resolveStatusCascade: vi.fn(),
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
  taskService: { contractContext: mocks.contractContext, find: mocks.find },
}));

vi.mock('@/components/Modal', () => ({ confirmModal: mocks.confirmModal }));

vi.mock('@/features/MyWork/workQueryBoardMove', () => ({
  moveBoardMaybePickingState: mocks.moveBoardMaybePickingState,
  resolveStatusCascade: mocks.resolveStatusCascade,
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
    mocks.contractContext.mockResolvedValue({ data: {} });
    mocks.find.mockResolvedValue(teamTask());
    mocks.moveBoardMaybePickingState.mockResolvedValue(true);
    mocks.mutate.mockResolvedValue(undefined);
    mocks.refreshDetail.mockResolvedValue(undefined);
    // Default: the Issue has no open sub-issues, so nothing is asked.
    mocks.resolveStatusCascade.mockImplementation(
      async (input: { parentOnly: () => Promise<number> }) => ({
        cascaded: false,
        revision: await input.parentOnly(),
      }),
    );
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

  describe('moving a parent to Done or Canceled', () => {
    const refreshedEveryDetail = () =>
      mocks.mutate.mock.calls.some((call) => call[0](['task:detail', 'T-other']) === true);

    it('asks about open sub-issues for Done and Canceled, and for nothing else', async () => {
      const { result } = renderHook(() => useIssueStatusMove());
      await result.current({ taskIdentifier: 'T-9', target: target({ category: 'in_progress' }) });
      expect(mocks.resolveStatusCascade).not.toHaveBeenCalled();

      await result.current({ taskIdentifier: 'T-9', target: target({ category: 'done' }) });
      expect(mocks.resolveStatusCascade).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'completed',
          task: { id: 'tsk_9', identifier: 'T-9' },
        }),
      );
      await result.current({ taskIdentifier: 'T-9', target: target({ category: 'canceled' }) });
      expect(mocks.resolveStatusCascade).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'canceled' }),
      );
    });

    it('continues from the cascade revision and refreshes every cached detail on "update all"', async () => {
      mocks.resolveStatusCascade.mockResolvedValue({ cascaded: true, revision: 12 });
      const { result } = renderHook(() => useIssueStatusMove());
      const moved = await result.current({
        taskIdentifier: 'T-9',
        target: target({ category: 'done' }),
      });

      expect(moved).toBe(true);
      expect(mocks.moveBoardMaybePickingState).toHaveBeenCalledWith(
        expect.objectContaining({ expectedDomainRevision: 12, targetKey: 'done' }),
      );
      // Sub-issue rows live in other Issues' details — all of them are refetched.
      expect(refreshedEveryDetail()).toBe(true);
    });

    it('moves only the parent, from its own revision, on "parent only"', async () => {
      const { result } = renderHook(() => useIssueStatusMove());
      const moved = await result.current({
        taskIdentifier: 'T-9',
        target: target({ category: 'done' }),
      });

      expect(moved).toBe(true);
      expect(mocks.moveBoardMaybePickingState).toHaveBeenCalledWith(
        expect.objectContaining({ expectedDomainRevision: 7, targetKey: 'done' }),
      );
      expect(refreshedEveryDetail()).toBe(false);
      expect(mocks.refreshDetail).toHaveBeenCalledWith('T-9');
    });

    it('writes nothing when the question is dismissed', async () => {
      mocks.resolveStatusCascade.mockResolvedValue(undefined);
      const { result } = renderHook(() => useIssueStatusMove());
      const moved = await result.current({
        taskIdentifier: 'T-9',
        target: target({ category: 'canceled' }),
      });

      expect(moved).toBe(false);
      expect(mocks.moveBoardMaybePickingState).not.toHaveBeenCalled();
      expect(mocks.updateTask).not.toHaveBeenCalled();
      expect(mocks.mutate).not.toHaveBeenCalled();
    });

    it('does not write the category a second time for a team-less Issue the cascade already moved', async () => {
      mocks.find.mockResolvedValue(teamTask({ teamId: null }));
      mocks.resolveStatusCascade.mockResolvedValue({ cascaded: true, revision: 12 });
      const { result } = renderHook(() => useIssueStatusMove());
      const moved = await result.current({
        taskIdentifier: 'T-9',
        target: target({ category: 'done' }),
      });

      expect(moved).toBe(true);
      expect(mocks.updateTask).not.toHaveBeenCalled();
      expect(refreshedEveryDetail()).toBe(true);
    });

    it('skips the question where the board skips it', async () => {
      // Tied to a provider workflow state: the exact state is chosen instead.
      mocks.find.mockResolvedValue(teamTask({ workflowStateId: 'linear-state-1' }));
      const { result } = renderHook(() => useIssueStatusMove());
      await result.current({ taskIdentifier: 'T-9', target: target({ category: 'done' }) });
      // Already Done: picking another Done state is not a move into Done.
      mocks.find.mockResolvedValue(teamTask({ workflowCategory: 'done' }));
      await result.current({ taskIdentifier: 'T-9', target: target({ category: 'done' }) });

      expect(mocks.resolveStatusCascade).not.toHaveBeenCalled();
    });

    it('reports a failed sub-issue check and moves nothing', async () => {
      mocks.resolveStatusCascade.mockRejectedValue(new Error('offline'));
      const { result } = renderHook(() => useIssueStatusMove());

      await expect(
        result.current({ taskIdentifier: 'T-9', target: target({ category: 'done' }) }),
      ).rejects.toThrow('offline');
      expect(mocks.toastError).toHaveBeenCalledTimes(1);
      expect(mocks.moveBoardMaybePickingState).not.toHaveBeenCalled();
    });
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

  it('never spawns a builder when the issue moves into review', async () => {
    mocks.find.mockResolvedValue(
      teamTask({ automationMode: null, status: 'backlog', workflowCategory: 'in_progress' }),
    );
    const { result } = renderHook(() => useIssueStatusMove());
    await result.current({
      taskIdentifier: 'T-9',
      target: target({ category: 'in_review' }),
    });
    expect(mocks.runTask).not.toHaveBeenCalled();
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

  // The move is how an Issue starts, so it takes the same contract check as
  // the Issue's own Start / Retry / Resume.
  it('confirms pending constraint edits before the move starts a repair run', async () => {
    mocks.contractContext.mockResolvedValue({
      data: { contract: { revision: 3 }, pendingConstraintEdits: true },
    });
    mocks.confirmModal.mockImplementation((options: { onOk: () => void }) => options.onOk());
    mocks.find.mockResolvedValue(
      teamTask({ automationMode: null, status: 'backlog', workflowCategory: 'todo' }),
    );
    const { result } = renderHook(() => useIssueStatusMove());
    await result.current({ taskIdentifier: 'T-9', target: target({ category: 'in_progress' }) });

    expect(mocks.confirmModal).toHaveBeenCalledTimes(1);
    expect(mocks.runTask).toHaveBeenCalledWith('T-9', { intent: 'repair' });
  });

  it('keeps the move and starts nothing when that confirmation is declined', async () => {
    mocks.contractContext.mockResolvedValue({
      data: { contract: { revision: 3 }, pendingConstraintEdits: true },
    });
    mocks.confirmModal.mockImplementation((options: { onCancel: () => void }) =>
      options.onCancel(),
    );
    mocks.find.mockResolvedValue(
      teamTask({ automationMode: null, status: 'backlog', workflowCategory: 'todo' }),
    );
    const { result } = renderHook(() => useIssueStatusMove());
    const moved = await result.current({
      taskIdentifier: 'T-9',
      target: target({ category: 'in_progress' }),
    });

    expect(moved).toBe(true);
    expect(mocks.runTask).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
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
