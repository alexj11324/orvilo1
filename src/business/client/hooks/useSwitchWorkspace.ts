'use client';

import { useCallback } from 'react';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { useWorkspaceContextStore } from '../workspaceContextStore';
import { useWorkspaces } from './useWorkspaces';

export interface SwitchWorkspaceActions {
  switchToPersonal: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
}

const useSetActiveWorkspace = () => useWorkspaceContextStore((s) => s.setActiveWorkspace);

/**
 * Workspace switch invoked from imperative call sites that represent an
 * explicit user choice (e.g. switcher click, wizard landing, accept-invite,
 * post-leave redirect). Sets the store immediately so scoped requests flip
 * scope at once, then navigates to the workspace landing so the URL — the
 * source of truth — catches up.
 */
export const useSwitchWorkspace = (): SwitchWorkspaceActions => {
  const navigate = useWorkspaceAwareNavigate();
  const workspaces = useWorkspaces();
  const setActiveWorkspace = useSetActiveWorkspace();

  const switchWorkspace = useCallback(
    async (id: string) => {
      const workspace = workspaces.find((w) => w.id === id);
      // A switch target the membership list can't resolve has no slug to
      // navigate to — leave the current scope untouched rather than land on a
      // fabricated URL.
      if (!workspace) return;
      setActiveWorkspace({ id: workspace.id, slug: workspace.slug });
      navigate(`/${workspace.slug}`, { escape: true });
    },
    [navigate, setActiveWorkspace, workspaces],
  );

  const switchToPersonal = useCallback(async () => {
    setActiveWorkspace(null);
    navigate('/', { escape: true });
  }, [navigate, setActiveWorkspace]);

  return { switchToPersonal, switchWorkspace };
};

/**
 * Workspace switch invoked from passive reconciliation sources (e.g. URL
 * sync) where the active workspace is being aligned with external state
 * rather than chosen by the user. Only writes the store — navigation stays
 * with whatever produced the URL.
 */
export const useSilentSwitchWorkspace = (): SwitchWorkspaceActions => {
  const workspaces = useWorkspaces();
  const setActiveWorkspace = useSetActiveWorkspace();

  const switchWorkspace = useCallback(
    async (id: string) => {
      const workspace = workspaces.find((w) => w.id === id);
      if (!workspace) return;
      setActiveWorkspace({ id: workspace.id, slug: workspace.slug });
    },
    [setActiveWorkspace, workspaces],
  );

  const switchToPersonal = useCallback(async () => {
    setActiveWorkspace(null);
  }, [setActiveWorkspace]);

  return { switchToPersonal, switchWorkspace };
};
