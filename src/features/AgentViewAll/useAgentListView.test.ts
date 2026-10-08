import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentListView } from './useAgentListView';

const state = vi.hoisted(() => ({
  isInit: false,
  error: new Error('request failed'),
  isValidating: false,
  data: undefined,
  useFetchAgentList: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('@/store/user', () => ({ useUserStore: () => true }));
vi.mock('@/store/user/slices/auth/selectors', () => ({ authSelectors: { isLogin: () => true } }));
vi.mock('@/store/home/selectors', () => ({
  homeAgentListSelectors: { isAgentListInit: () => state.isInit },
}));
describe('Agent directory retry state', () => {
  beforeEach(() => {
    state.isInit = false;
    state.isValidating = false;
    vi.clearAllMocks();
    state.useFetchAgentList.mockImplementation(() => state);
  });
  it('retains the initial error through retry and reports progress to the recovery surface', () => {
    const { result, rerender } = renderHook(() => useAgentListView(0));
    expect(result.current.view).toBe('error');
    expect(result.current.errorProps.error).toBe(state.error);
    result.current.errorProps.onRetry();
    expect(state.mutate).toHaveBeenCalledOnce();
    state.isValidating = true;
    rerender();
    expect(result.current.view).toBe('error');
    expect(result.current.errorProps.retrying).toBe(true);
  });
  it('retains an initialized list through a refresh failure', () => {
    state.isInit = true;
    const { result } = renderHook(() => useAgentListView(2));
    expect(result.current.view).toBe('list');
  });
});
