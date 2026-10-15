import { ThemeProvider } from '@lobehub/ui';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { ThemeRoles } from '@/styles/themeRoles';

import { resolveApprovalDuration, useApprovalMotion } from './useApprovalMotion';

const QUERY = '(prefers-reduced-motion: reduce)';
const ThemeHost = ({ children }: { children: ReactNode }) => {
  const mode = useUserStore(userGeneralSettingsSelectors.animationMode);
  return createElement(
    ThemeProvider,
    {
      appearance: 'light',
      enableCustomFonts: false,
      enableGlobalStyle: false,
      theme: { token: { motion: mode !== 'disabled', motionUnit: mode === 'agile' ? 0.05 : 0.1 } },
    },
    createElement(ThemeRoles, { children }),
  );
};

describe('approval motion live policy', () => {
  const original = useUserStore.getState().settings;
  let reduced = false;
  let listeners: Set<(event: MediaQueryListEvent) => void>;

  const setMode = (animationMode: 'agile' | 'disabled' | 'elegant') => {
    useUserStore.setState({
      settings: { ...original, general: { ...original.general, animationMode } },
    });
  };

  beforeEach(() => {
    listeners = new Set();
    reduced = false;
    setMode('agile');
    const query = {
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      get matches() {
        return reduced;
      },
      media: QUERY,
      onchange: null,
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    } as unknown as MediaQueryList;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((text: string) =>
        text === QUERY
          ? query
          : {
              ...query,
              addEventListener: () => {},
              addListener: () => {},
              matches: false,
              media: text,
              removeEventListener: () => {},
              removeListener: () => {},
            },
      ),
    );
  });

  afterEach(() => {
    cleanup();
    useUserStore.setState({ settings: original });
    vi.unstubAllGlobals();
  });

  it('starts without an exit delay when the actual user setting disables motion', () => {
    setMode('disabled');
    const { result } = renderHook(useApprovalMotion, { wrapper: ThemeHost });
    expect(result.current).toEqual({ durationMs: 0, enabled: false });
  });

  it('uses the actual normal mid duration for elegant motion', () => {
    setMode('elegant');
    const { result } = renderHook(useApprovalMotion, { wrapper: ThemeHost });
    expect(result.current).toEqual({ durationMs: 200, enabled: true });
  });

  it('starts without an exit delay when the OS already reduces motion', () => {
    reduced = true;
    const { result } = renderHook(useApprovalMotion, { wrapper: ThemeHost });
    expect(result.current).toEqual({ durationMs: 0, enabled: false });
  });

  it('responds to a live user change through the real resolved theme authority', () => {
    const { result } = renderHook(useApprovalMotion, { wrapper: ThemeHost });
    expect(result.current.enabled).toBe(true);
    expect(result.current.durationMs).toBe(100);
    act(() => setMode('disabled'));
    expect(result.current).toEqual({ durationMs: 0, enabled: false });
  });

  it('responds to live OS preference changes and removes its subscription on unmount', () => {
    const { result, unmount } = renderHook(useApprovalMotion, { wrapper: ThemeHost });
    expect(result.current.enabled).toBe(true);
    act(() => {
      reduced = true;
      for (const listener of listeners)
        listener({ matches: true, media: QUERY } as MediaQueryListEvent);
    });
    expect(result.current).toEqual({ durationMs: 0, enabled: false });
    act(() => {
      reduced = false;
      for (const listener of listeners)
        listener({ matches: false, media: QUERY } as MediaQueryListEvent);
    });
    expect(result.current.enabled).toBe(true);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('preserves resolved units and avoids retaining an exit for an invalid duration', () => {
    expect(resolveApprovalDuration(true, '0.1s', false)).toBe(100);
    expect(resolveApprovalDuration(true, '200ms', false)).toBe(200);
    expect(resolveApprovalDuration(true, 'invalid', false)).toBe(0);
    expect(resolveApprovalDuration(true, '200ms', true)).toBe(0);
  });
});
