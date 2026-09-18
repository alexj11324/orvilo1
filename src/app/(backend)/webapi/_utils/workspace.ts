import { getActiveWorkspaceMembershipRole } from '@/database/models/workspace';
import type { OrviloDatabase } from '@/database/type';

export const WORKSPACE_ID_HEADER = 'X-Workspace-Id';

/**
 * Thrown when a request explicitly addresses a workspace the caller cannot
 * access. "Workspace not found" and "not an active member" (including
 * suspended and removed memberships) are reported identically, so the
 * rejection cannot leak whether the workspace exists.
 */
export class WorkspaceAccessDeniedError extends Error {
  constructor(message = 'Workspace not found') {
    super(message);
    this.name = 'WorkspaceAccessDeniedError';
  }
}

/**
 * Resolve the `X-Workspace-Id` selector to a workspace the caller belongs to.
 *
 * `X-Workspace-Id` is a selector, not proof of membership:
 * - header absent → `undefined` (explicit personal mode)
 * - header + active member → the workspace id
 * - header + anything else → throws {@link WorkspaceAccessDeniedError}.
 *   Callers must reject the request — the previous silent `undefined`
 *   fallback let a mistyped or unauthorized workspace read/write personal
 *   space as if no workspace had been selected at all.
 */
export const resolveValidWorkspaceIdFromRequest = async (params: {
  req: Request;
  serverDB: OrviloDatabase;
  userId: string;
}): Promise<string | undefined> => {
  const workspaceId = params.req.headers.get(WORKSPACE_ID_HEADER)?.trim();
  if (!workspaceId) return undefined;

  // Active membership is the only proof: a missing workspace, a non-member,
  // and a suspended/removed member all resolve to `null`.
  const role = await getActiveWorkspaceMembershipRole(params.serverDB, {
    userId: params.userId,
    workspaceId,
  });

  if (!role) throw new WorkspaceAccessDeniedError();

  return workspaceId;
};
