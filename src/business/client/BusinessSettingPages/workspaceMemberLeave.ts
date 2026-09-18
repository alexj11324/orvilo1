import { WORKSPACE_LIST_KEY } from '@/business/client/hooks/useFetchWorkspaces';
import { mutate } from '@/libs/swr';

/**
 * Self-serve leave flow for the members settings page: run the server
 * mutation, drop the cached workspace list, then exit to personal mode.
 * The order is load-bearing — `workspace.list` is keyed by the caller's
 * memberships, so a stale snapshot would keep the departed workspace
 * selectable until the next revalidation.
 */
export const runLeaveWorkspace = async (deps: {
  leave: () => Promise<boolean>;
  switchToPersonal: () => Promise<void>;
}): Promise<boolean> => {
  const left = await deps.leave();
  if (!left) return false;
  await mutate(WORKSPACE_LIST_KEY);
  await deps.switchToPersonal();
  return true;
};
