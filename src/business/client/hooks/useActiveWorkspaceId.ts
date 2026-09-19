import { getWorkspaceContextState, useWorkspaceContextStore } from '../workspaceContextStore';

/**
 * Active workspace selector shared by the SWR cache scope, the
 * `X-Workspace-Id` header slot and every scoped surface. `null` is explicit
 * personal mode — scoped requests then carry no workspace header.
 */
export const getActiveWorkspaceId = (): string | null =>
  getWorkspaceContextState().activeWorkspaceId;

export const useActiveWorkspaceId = (): string | null =>
  useWorkspaceContextStore((s) => s.activeWorkspaceId);
