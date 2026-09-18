import type { WorkspaceListItem } from './useActiveWorkspace';
import { useFetchWorkspaces } from './useFetchWorkspaces';

const EMPTY: WorkspaceListItem[] = [];

/**
 * The caller's workspace memberships as a plain array — the long-standing
 * contract of this business slot (URL sync, route meta, pickers all consume
 * the array shape). Backed by the real `workspace.list` query; loading and
 * error states are available through `useFetchWorkspaces` for surfaces that
 * render them.
 */
export const useWorkspaces = (): WorkspaceListItem[] => {
  const { data } = useFetchWorkspaces();
  return data ?? EMPTY;
};
