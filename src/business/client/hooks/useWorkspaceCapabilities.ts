import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { useActiveWorkspace } from './useActiveWorkspace';

export interface WorkspaceCapabilities {
  /** The caller may grant the admin role (owner-only in v1). */
  canGrantAdmin: boolean;
  /** The caller may invite workspace members (owner/admin). */
  canInvite: boolean;
  /** The caller may leave the workspace (non-owner member). */
  canLeave: boolean;
  /** The caller may manage non-owner rows below their own ceiling. */
  canManageMembers: boolean;
  /** The caller is the workspace owner. */
  isOwner: boolean;
  /** The caller's role on the active workspace — null in personal mode. */
  role: string | null;
}

/**
 * The caller's role-derived capabilities inside the active workspace. Derived
 * from `workspace.list` membership role — the same source the server's role
 * ceiling enforces — so the UI offers only actions the API would accept. In
 * personal mode (no active workspace) everything reads as unavailable.
 */
export const useWorkspaceCapabilities = (): WorkspaceCapabilities => {
  const workspace = useActiveWorkspace();
  const userId = useUserStore(userProfileSelectors.userId);
  const role = workspace?.role ?? null;

  return {
    canGrantAdmin: role === 'owner',
    canInvite: role === 'owner' || role === 'admin',
    canLeave: !!role && role !== 'owner' && !!userId,
    canManageMembers: role === 'owner' || role === 'admin',
    isOwner: role === 'owner',
    role,
  };
};
