import type { WorkspaceItem } from '@orvilo/database/schemas';

import { useActiveWorkspaceId } from './useActiveWorkspaceId';
import { useFetchWorkspaces } from './useFetchWorkspaces';

export type WorkspaceListItem = WorkspaceItem & {
  /**
   * True when the caller is a non-primary member of a workspace whose paid
   * subscription has lapsed. The cloud override of `workspace.list` sets it;
   * open-source stub leaves it absent.
   */
  lockedOut?: boolean;
  plan?: 'business' | 'free' | 'pro';
  role?: string;
};

/**
 * The workspace the caller is currently scoped into, validated against their
 * membership list. The selection itself lives in `useActiveWorkspaceId` (the
 * business slot shared by headers, cache scope and URL sync) — this hook only
 * resolves it through `workspace.list`, so a stale or revoked selection reads
 * as `null` instead of a phantom workspace.
 */
export const useActiveWorkspace = (): WorkspaceListItem | null => {
  const activeId = useActiveWorkspaceId();
  const { data: workspaces } = useFetchWorkspaces();
  if (!activeId || !workspaces) return null;
  return workspaces.find((workspace) => workspace.id === activeId) ?? null;
};
