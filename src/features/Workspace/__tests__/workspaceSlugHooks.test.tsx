import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as useActiveWorkspaceIdModule from '@/business/client/hooks/useActiveWorkspaceId';
import * as useActiveWorkspaceSlugModule from '@/business/client/hooks/useActiveWorkspaceSlug';
import * as useFetchWorkspacesModule from '@/business/client/hooks/useFetchWorkspaces';
import * as useIsWorkspaceLoadingModule from '@/business/client/hooks/useIsWorkspaceLoading';
import * as useSwitchWorkspaceModule from '@/business/client/hooks/useSwitchWorkspace';
import * as useWorkspacesModule from '@/business/client/hooks/useWorkspaces';

import { useWorkspaceFromSlug } from '../useWorkspaceFromSlug';
import { useWorkspaceUrlSync } from '../useWorkspaceUrlSync';

const ensureDefaultWorkspace = vi.hoisted(() => vi.fn(async () => null));
vi.mock('../ensureDefaultWorkspace', () => ({ ensureDefaultWorkspace }));

interface WorkspaceStateMock {
  activeWorkspaceId: null | string;
  activeWorkspaceSlug: null | string;
  isWorkspaceLoading: boolean;
  switchWorkspace: (id: string) => void;
  workspaces: { id: string; lockedOut?: boolean; slug: string }[];
}

const createState = (overrides: Partial<WorkspaceStateMock> = {}): WorkspaceStateMock => ({
  activeWorkspaceId: null,
  activeWorkspaceSlug: null,
  isWorkspaceLoading: false,
  switchWorkspace: vi.fn(),
  workspaces: [{ id: 'ws-1', slug: 'acme' }],
  ...overrides,
});

const mockWorkspaceStore = (state: WorkspaceStateMock) => {
  vi.spyOn(useWorkspacesModule, 'useWorkspaces').mockReturnValue(state.workspaces as any);
  // The URL sync reads the resolved list (not just the array) so it can tell
  // "membership is gone" apart from "list never loaded".
  vi.spyOn(useFetchWorkspacesModule, 'useFetchWorkspaces').mockReturnValue({
    data: state.workspaces,
    isLoading: state.isWorkspaceLoading,
  } as any);
  vi.spyOn(useIsWorkspaceLoadingModule, 'useIsWorkspaceLoading').mockReturnValue(
    state.isWorkspaceLoading,
  );
  vi.spyOn(useActiveWorkspaceIdModule, 'useActiveWorkspaceId').mockReturnValue(
    state.activeWorkspaceId,
  );
  vi.spyOn(useActiveWorkspaceSlugModule, 'useActiveWorkspaceSlug').mockReturnValue(
    state.activeWorkspaceSlug,
  );
  vi.spyOn(useSwitchWorkspaceModule, 'useSilentSwitchWorkspace').mockReturnValue({
    switchWorkspace: state.switchWorkspace as any,
  });
};

const createRouteWrapper =
  (initialEntry: string, path = '/:workspaceSlug/*') =>
  ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={children} path={path} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => {
  vi.restoreAllMocks();
  ensureDefaultWorkspace.mockClear();
});

describe('useWorkspaceFromSlug', () => {
  it('returns ok when the URL slug matches a workspace', () => {
    mockWorkspaceStore(createState());

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/acme/settings'),
    });

    expect(result.current).toEqual({ slug: 'acme', status: 'ok', workspaceId: 'ws-1' });
  });

  it('returns loading for an unknown slug while workspaces are loading', () => {
    mockWorkspaceStore(createState({ isWorkspaceLoading: true, workspaces: [] }));

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/acme/settings'),
    });

    expect(result.current).toEqual({ slug: 'acme', status: 'loading' });
  });

  it('returns not-found for an unknown slug after loading completes', () => {
    mockWorkspaceStore(createState({ workspaces: [] }));

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/missing/settings'),
    });

    expect(result.current).toEqual({ slug: 'missing', status: 'not-found' });
  });

  it('returns no-slug outside the workspace route tree', () => {
    mockWorkspaceStore(createState());

    const { result } = renderHook(() => useWorkspaceFromSlug(), {
      wrapper: createRouteWrapper('/settings/profile', '/settings/*'),
    });

    expect(result.current).toEqual({ status: 'no-slug' });
  });
});

describe('useWorkspaceUrlSync', () => {
  it('switches to the workspace when the first segment is a known slug', () => {
    const state = createState();
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/acme/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).toHaveBeenCalledWith('ws-1');
  });

  it('does not switch while the workspace list is loading', () => {
    const state = createState({ isWorkspaceLoading: true });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/acme/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).not.toHaveBeenCalled();
  });

  it('leaves the current workspace untouched for an unknown slug', () => {
    // `/unknown/...` resolves to the 404 boundary; the reconcile below sees the
    // active membership still present and already the target, so nothing moves.
    const state = createState({ activeWorkspaceId: 'ws-1', activeWorkspaceSlug: 'acme' });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/unknown/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).not.toHaveBeenCalled();
  });

  it('activates the last-used workspace on reserved slug-less routes', () => {
    // No personal scope: a reserved path still carries workspace context.
    const state = createState({ activeWorkspaceId: null });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/settings/profile', '*'),
    });

    expect(state.switchWorkspace).toHaveBeenCalledWith('ws-1');
  });

  it('provisions a default workspace when the account has none', () => {
    const state = createState({ workspaces: [] });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/settings/profile', '*'),
    });

    expect(ensureDefaultWorkspace).toHaveBeenCalled();
    expect(state.switchWorkspace).not.toHaveBeenCalled();
  });

  it('re-provisions when the active workspace leaves the membership list', () => {
    // Revocation while its slug URL is still open: the workspace is absent
    // from the resolved list, so the store must not keep scoping requests to
    // a membership the server would now reject — with an empty list the sync
    // falls back to ensureDefault rather than a stale scope.
    const state = createState({ activeWorkspaceId: 'ws-1', workspaces: [] });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/acme/agent/inbox', '*'),
    });

    expect(ensureDefaultWorkspace).toHaveBeenCalled();
    expect(state.switchWorkspace).not.toHaveBeenCalled();
  });

  it('falls back to another membership when the revoked active workspace has siblings', () => {
    const state = createState({
      activeWorkspaceId: 'ws-1',
      activeWorkspaceSlug: 'acme',
      workspaces: [{ id: 'ws-2', slug: 'other' }],
    });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/acme/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).toHaveBeenCalledWith('ws-2');
    expect(ensureDefaultWorkspace).not.toHaveBeenCalled();
  });

  it('keeps the active workspace when the URL slug is unknown but membership is intact', () => {
    const state = createState({ activeWorkspaceId: 'ws-1', activeWorkspaceSlug: 'acme' });
    mockWorkspaceStore(state);

    renderHook(() => useWorkspaceUrlSync(), {
      wrapper: createRouteWrapper('/typo-slug/agent/inbox', '*'),
    });

    expect(state.switchWorkspace).not.toHaveBeenCalled();
  });
});
