'use client';

import { useMemo } from 'react';

import { useActiveWorkspaceId } from './useActiveWorkspaceId';
import { useWorkspaces } from './useWorkspaces';

/**
 * Active identity shown in the user button / panel header. When a team
 * workspace is selected the header reflects that workspace (avatar + name);
 * in personal context it returns null and callers fall back to user data.
 */
export interface ActiveIdentity {
  avatar?: string | null;
  name?: string | null;
}

export const useActiveIdentity = (): ActiveIdentity | null => {
  const workspaceId = useActiveWorkspaceId();
  const workspaces = useWorkspaces();

  return useMemo(() => {
    if (!workspaceId) return null;
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) return null;
    return { avatar: workspace.avatar, name: workspace.name };
  }, [workspaceId, workspaces]);
};
