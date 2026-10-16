'use client';
import type { WorkspaceListItem } from '@/business/client/hooks/useActiveWorkspace';
import { WORKSPACE_LIST_KEY } from '@/business/client/hooks/useFetchWorkspaces';
import { mutate } from '@/libs/swr';
import { workspaceService } from '@/services/workspace';

let inflight: Promise<WorkspaceListItem> | null = null;

/**
 * Linear-model provisioning: the account always has a workspace. When the
 * membership list resolves empty, create a default one named after the user
 * server-side and revalidate the SWR list so URL sync can activate it.
 *
 * Single-flight so concurrent mounts / navigations never double-provision;
 * the server-side `ensureDefault` is also idempotent for cross-tab races.
 */
export const ensureDefaultWorkspace = (): Promise<WorkspaceListItem> => {
  if (inflight) return inflight;
  inflight = (async () => {
    const workspace = await workspaceService.ensureDefault();
    await mutate(WORKSPACE_LIST_KEY);
    return workspace as WorkspaceListItem;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
};
