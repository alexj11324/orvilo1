'use client';

import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { setActiveWorkspaceContext } from './useActiveWorkspaceId';
import { useWorkspaces } from './useWorkspaces';

export interface SwitchWorkspaceActions {
  switchToPersonal: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
}

/**
 * Workspace switch invoked from imperative call sites that represent an
 * explicit user choice (e.g. switcher click, wizard landing, accept-invite,
 * post-leave redirect). Writes the active selection and navigates to the
 * workspace home (`/{slug}`) or `/` for personal.
 */
export const useSwitchWorkspace = (): SwitchWorkspaceActions => {
  const navigate = useNavigate();
  const workspaces = useWorkspaces();

  const switchWorkspace = useCallback(
    async (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (!ws) return;
      setActiveWorkspaceContext({ id: ws.id, slug: ws.slug });
      navigate(`/${ws.slug}`);
    },
    [navigate, workspaces],
  );

  const switchToPersonal = useCallback(async () => {
    setActiveWorkspaceContext(null);
    navigate('/');
  }, [navigate]);

  return { switchToPersonal, switchWorkspace };
};

/**
 * Workspace switch invoked from passive reconciliation sources (e.g. URL
 * sync) where the active workspace is being aligned with external state
 * rather than chosen by the user — writes the selection without navigating.
 */
export const useSilentSwitchWorkspace = (): SwitchWorkspaceActions => {
  const workspaces = useWorkspaces();

  const switchWorkspace = useCallback(
    async (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (!ws) return;
      setActiveWorkspaceContext({ id: ws.id, slug: ws.slug });
    },
    [workspaces],
  );

  const switchToPersonal = useCallback(async () => {
    setActiveWorkspaceContext(null);
  }, []);

  return { switchToPersonal, switchWorkspace };
};
