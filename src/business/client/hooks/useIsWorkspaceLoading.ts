import { useFetchWorkspaces } from './useFetchWorkspaces';

/**
 * True while the caller's workspace memberships are unresolved — either the
 * first `workspace.list` request is in flight, or it failed before producing
 * any data. Treating a cold error as "still loading" keeps the slug boundary
 * and URL sync from acting on an empty list they cannot trust (a false 404 /
 * a wrongful drop to personal would both corrupt scope).
 */
export const useIsWorkspaceLoading = (): boolean => {
  const { data, error, isLoading } = useFetchWorkspaces();
  return isLoading || (data === undefined && error !== undefined);
};
