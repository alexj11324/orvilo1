/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsUserState } from './useSettingsUserState';

const state = vi.hoisted(() => ({
  isUserStateInit: false,
  isUserStateInitError: undefined as unknown,
  refreshUserState: vi.fn(),
}));
vi.mock('@/store/user', () => ({
  useUserStore: (selector: (s: typeof state) => unknown) => selector(state),
}));

describe('settings bootstrap recovery', () => {
  afterEach(cleanup);
  beforeEach(() => {
    state.isUserStateInit = false;
    state.isUserStateInitError = undefined;
    state.refreshUserState.mockReset();
  });

  it('distinguishes initial loading, failed bootstrap and successful retry', async () => {
    const { result, rerender } = renderHook(useSettingsUserState);
    expect(result.current.ready).toBe(false);
    expect(result.current.error).toBeUndefined();
    state.isUserStateInitError = new Error('Offline');
    rerender();
    expect(result.current.error).toBe(state.isUserStateInitError);
    let finish!: () => void;
    state.refreshUserState.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.retry();
      void result.current.retry();
    });
    expect(result.current.retrying).toBe(true);
    expect(state.refreshUserState).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.retrying).toBe(false);
    state.isUserStateInit = true;
    state.isUserStateInitError = undefined;
    rerender();
    expect(result.current.ready).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('preserves failure and permits another retry after rejection', async () => {
    state.isUserStateInitError = new Error('Failed');
    state.refreshUserState.mockRejectedValue(new Error('Still offline'));
    const { result } = renderHook(useSettingsUserState);
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.retrying).toBe(false);
    expect(result.current.error).toBe(state.isUserStateInitError);
    await act(async () => {
      await result.current.retry();
    });
    expect(state.refreshUserState).toHaveBeenCalledTimes(2);
  });
});
