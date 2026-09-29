/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActiveTaskDetail } from './useActiveTaskDetail';

const mocks = vi.hoisted(() => ({
  agentState: {} as any,
  isLogin: true as boolean | undefined,
  taskState: {} as any,
}));

vi.mock('@/store/user', () => ({
  useUserStore: () => mocks.isLogin,
}));

vi.mock('@/store/user/selectors', () => ({
  authSelectors: { isLogin: (s: any) => s?.isLogin },
}));

vi.mock('@/store/task', () => {
  const useTaskStore = (selector: any) => selector(mocks.taskState);
  useTaskStore.getState = () => mocks.taskState;
  return { useTaskStore };
});

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: any) => selector(mocks.agentState),
}));

const buildTaskState = (
  overrides: {
    agentId?: string | null;
    detail?: boolean;
    taskError?: unknown;
  } = {},
) => {
  const { agentId = 'agt_assignee', detail = true, taskError } = overrides;
  return {
    activeTaskId: undefined,
    setActiveTaskId: vi.fn(),
    taskDetailMap: detail ? { 'T-194': { agentId } } : {},
    // `useFetchTaskDetail` is read off the store and called with the id.
    useFetchTaskDetail: () => ({ error: taskError, mutate: vi.fn() }),
  };
};

const buildAgentState = (overrides: { inMap?: boolean; isLoading?: boolean } = {}) => {
  const { inMap = false, isLoading = false } = overrides;
  return {
    agentMap: inMap ? { agt_assignee: { id: 'agt_assignee' } } : {},
    useHydrateAgentConfig: () => ({ isLoading }),
  };
};

describe('useActiveTaskDetail', () => {
  beforeEach(() => {
    mocks.isLogin = true;
    mocks.taskState = buildTaskState();
    mocks.agentState = buildAgentState();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT deadlock when the assignee agent was deleted / moved to another workspace', () => {
    // The ownership-scoped fetch resolves to null: SWR settles (isLoading=false),
    // the agent never lands in agentMap, and there is no error. The detail page
    // must still render instead of spinning forever.
    mocks.taskState = buildTaskState({ agentId: 'agt_moved_away' });
    mocks.agentState = buildAgentState({ inMap: false, isLoading: false });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.isNotFound).toBe(false);
  });

  it('keeps the skeleton up while the assignee config fetch is genuinely in-flight', () => {
    mocks.agentState = buildAgentState({ inMap: false, isLoading: true });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isInitialLoading).toBe(true);
  });

  it('releases once the assignee config is hydrated into the map', () => {
    mocks.agentState = buildAgentState({ inMap: true, isLoading: false });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isInitialLoading).toBe(false);
  });

  it('does not block on the assignee when the task has no assignee', () => {
    mocks.taskState = buildTaskState({ agentId: null });
    mocks.agentState = buildAgentState({ inMap: false, isLoading: true });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isInitialLoading).toBe(false);
  });

  it('stays loading while the task detail itself is still resolving', () => {
    mocks.taskState = buildTaskState({ detail: false });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.isNotFound).toBe(false);
  });

  it('reports not-found when the fetch threw a tagged not-found and there is no cached detail', () => {
    const notFound = Object.assign(new Error('Task not found: T-194'), { code: 'TASK_NOT_FOUND' });
    mocks.taskState = buildTaskState({ detail: false, taskError: notFound });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isNotFound).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.isInitialLoading).toBe(false);
  });

  it('clears the shared slot on unmount only while it still points at this task', () => {
    const { unmount } = renderHook(() => useActiveTaskDetail('T-194'));

    // Mount claims the slot; it still points at this task at cleanup time.
    mocks.taskState.activeTaskId = 'T-194';
    unmount();

    expect(mocks.taskState.setActiveTaskId).toHaveBeenCalledWith(undefined);
  });

  it('does NOT clear the shared slot when a second host has already claimed it', () => {
    const { unmount } = renderHook(() => useActiveTaskDetail('T-194'));

    // A second detail host (route page + portal at narrow widths) mounted after
    // this one and put its own task in the slot — host A's cleanup must not
    // blank host B's global consumers.
    mocks.taskState.activeTaskId = 'T-other';
    unmount();

    expect(mocks.taskState.setActiveTaskId).not.toHaveBeenCalledWith(undefined);
  });

  it('reports a transient fetch error (not a 404) when a network / 500 rejection has no cached detail', () => {
    const networkError = Object.assign(new Error('Internal Server Error'), {
      data: { httpStatus: 500 },
    });
    mocks.taskState = buildTaskState({ detail: false, taskError: networkError });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    // A merely-errored task must not read as deleted — reload path, not the 404 dead-end.
    expect(result.current.isNotFound).toBe(false);
    expect(result.current.error).toBe(networkError);
    expect(result.current.isInitialLoading).toBe(false);
  });
});
