import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as useWorkspacesModule from '@/business/client/hooks/useWorkspaces';

import { getWorkspaceContextState } from '../workspaceContextStore';
import { useSilentSwitchWorkspace, useSwitchWorkspace } from './useSwitchWorkspace';

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/']}>{children}</MemoryRouter>
);

beforeEach(() => {
  vi.spyOn(useWorkspacesModule, 'useWorkspaces').mockReturnValue([
    { id: 'ws-1', slug: 'acme' },
    { id: 'ws-2', slug: 'globex' },
  ] as any);
  getWorkspaceContextState().setActiveWorkspace(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSwitchWorkspace (user intent)', () => {
  it('sets the store and navigates to the workspace landing', async () => {
    const { result } = renderHook(
      () => ({ location: useLocation(), switcher: useSwitchWorkspace() }),
      { wrapper },
    );

    await act(() => result.current.switcher.switchWorkspace('ws-1'));

    expect(getWorkspaceContextState().activeWorkspaceId).toBe('ws-1');
    expect(getWorkspaceContextState().activeWorkspaceSlug).toBe('acme');
    expect(result.current.location.pathname).toBe('/acme');
  });

  it('returns to personal mode at the root path', async () => {
    getWorkspaceContextState().setActiveWorkspace({ id: 'ws-1', slug: 'acme' });
    const { result } = renderHook(
      () => ({ location: useLocation(), switcher: useSwitchWorkspace() }),
      { wrapper },
    );

    await act(() => result.current.switcher.switchToPersonal());

    expect(getWorkspaceContextState().activeWorkspaceId).toBeNull();
    expect(result.current.location.pathname).toBe('/');
  });

  it('does not switch to a workspace outside the membership list', async () => {
    const { result } = renderHook(() => useSwitchWorkspace(), { wrapper });

    await act(() => result.current.switchWorkspace('ws-foreign'));

    expect(getWorkspaceContextState().activeWorkspaceId).toBeNull();
  });
});

describe('useSilentSwitchWorkspace (passive reconcile)', () => {
  it('updates the store without navigating', async () => {
    const { result } = renderHook(
      () => ({ location: useLocation(), switcher: useSilentSwitchWorkspace() }),
      { wrapper },
    );

    await act(() => result.current.switcher.switchWorkspace('ws-2'));

    expect(getWorkspaceContextState().activeWorkspaceId).toBe('ws-2');
    expect(getWorkspaceContextState().activeWorkspaceSlug).toBe('globex');
    // Passive reconcile never moves the URL — the URL produced the switch.
    expect(result.current.location.pathname).toBe('/');
  });
});
