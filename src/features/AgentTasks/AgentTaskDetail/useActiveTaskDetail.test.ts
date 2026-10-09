/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActiveTaskDetail } from './useActiveTaskDetail';
import { useTaskVerifyModel } from './useTaskVerifyModel';

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

describe('acceptance generation configuration', () => {
  beforeEach(() => {
    mocks.isLogin = true;
    mocks.taskState = buildTaskState();
    mocks.agentState = {
      ...buildAgentState({ isLoading: true }),
      activeAgentId: 'agt_active',
      agentMap: { agt_active: { model: 'active-model', provider: 'active-provider' } },
    };
  });

  it('renders the Issue immediately but blocks generation while its assignee is hydrating', () => {
    const { result } = renderHook(() => ({
      detail: useActiveTaskDetail('T-194'),
      generation: useTaskVerifyModel({ assigneeAgentId: 'agt_assignee' }),
    }));

    expect(result.current.detail.isInitialLoading).toBe(false);
    expect(result.current.generation).toEqual({
      isLoading: true,
      isReady: false,
      model: '',
      provider: '',
    });
  });

  it('uses the resolved assignee instead of the active agent or global defaults', () => {
    const { result, rerender } = renderHook(() =>
      useTaskVerifyModel({ assigneeAgentId: 'agt_assignee' }),
    );
    mocks.agentState.agentMap.agt_assignee = {
      model: 'assigned-model',
      provider: 'assigned-provider',
    };
    rerender();

    expect(result.current).toEqual({
      isLoading: false,
      isReady: true,
      model: 'assigned-model',
      provider: 'assigned-provider',
    });
  });

  it('does not reuse the previous Issue assignee configuration after switching', () => {
    mocks.agentState.agentMap.agt_assignee = {
      model: 'assigned-model',
      provider: 'assigned-provider',
    };
    const { result, rerender } = renderHook(
      ({ assigneeAgentId }) => useTaskVerifyModel({ assigneeAgentId }),
      { initialProps: { assigneeAgentId: 'agt_assignee' } },
    );
    expect(result.current.isReady).toBe(true);
    rerender({ assigneeAgentId: 'agt_other' });

    expect(result.current.isReady).toBe(false);
    expect(result.current.model).toBe('');
  });

  it('uses a hydrated active agent for an unassigned Issue', () => {
    const { result } = renderHook(() => useTaskVerifyModel({}));

    expect(result.current).toMatchObject({
      isReady: true,
      model: 'active-model',
      provider: 'active-provider',
    });
  });

  it('requires the assignee config when only the task model is overridden', () => {
    const { result } = renderHook(() =>
      useTaskVerifyModel({ assigneeAgentId: 'agt_assignee', taskModel: 'override-model' }),
    );

    expect(result.current).toMatchObject({ isReady: false, model: 'override-model', provider: '' });
  });

  it('allows a complete explicit task override while the assignee is still hydrating', () => {
    const { result } = renderHook(() =>
      useTaskVerifyModel({
        assigneeAgentId: 'agt_assignee',
        taskModel: 'override-model',
        taskProvider: 'override-provider',
      }),
    );

    expect(result.current).toEqual({
      isLoading: false,
      isReady: true,
      model: 'override-model',
      provider: 'override-provider',
    });
  });

  it('keeps generation unavailable after a settled missing config without an endless spinner', () => {
    mocks.agentState.useHydrateAgentConfig = () => ({ isLoading: false });
    const { result } = renderHook(() => useTaskVerifyModel({ assigneeAgentId: 'agt_deleted' }));

    expect(result.current).toEqual({ isLoading: false, isReady: false, model: '', provider: '' });
  });
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

  it('does not hold the page while the assignee config fetch is in-flight', () => {
    mocks.agentState = buildAgentState({ inMap: false, isLoading: true });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isInitialLoading).toBe(false);
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

  it('reports not-found when task.detail rejects with the tRPC NOT_FOUND for a deleted Issue', () => {
    const trpcNotFound = Object.assign(new Error('Task not found'), {
      data: { code: 'NOT_FOUND', httpStatus: 404 },
    });
    mocks.taskState = buildTaskState({ detail: false, taskError: trpcNotFound });

    const { result } = renderHook(() => useActiveTaskDetail('T-194'));

    expect(result.current.isNotFound).toBe(true);
    expect(result.current.error).toBeUndefined();
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
