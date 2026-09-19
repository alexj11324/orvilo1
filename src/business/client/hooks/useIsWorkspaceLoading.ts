'use client';

import { useFetchWorkspaces } from './useFetchWorkspaces';

/**
 * True while the caller's workspace memberships are still loading. Workspace
 * surfaces gate on this so a `/{slug}` first paint doesn't flash the personal
 * context before the list resolves.
 */
export const useIsWorkspaceLoading = (): boolean => {
  const { isLoading } = useFetchWorkspaces();
  return !!isLoading;
};
