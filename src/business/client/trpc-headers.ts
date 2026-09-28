import { getActiveWorkspaceId } from './hooks/useActiveWorkspaceId';

/**
 * Extra headers merged into every lambda request. Emits the workspace scope
 * the server resolves through `resolveValidWorkspaceIdFromRequest` — header
 * absent means explicit personal mode, and the server rejects the request
 * rather than silently falling back when the id no longer maps to an active
 * membership.
 */
export const getBusinessTrpcHeaders = async (): Promise<Record<string, string>> => {
  const workspaceId = getActiveWorkspaceId();
  return workspaceId ? { 'X-Workspace-Id': workspaceId } : {};
};
