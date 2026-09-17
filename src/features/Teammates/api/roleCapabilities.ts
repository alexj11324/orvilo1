import type { ProjectRole, WorkspaceMemberSummary, WorkspaceRole } from './contract';

/**
 * Role ceiling rules for the members UI. The server is the security boundary;
 * these helpers only decide which menu items and options are even offered so
 * a caller can't produce a guaranteed-rejected action. Mirrors plan §5.1 /
 * §4.4: owner grants admin; admin manages member/viewer only; the owner row is
 * never mutable through member actions (ownership moves via transfer).
 */

export const WORKSPACE_ROLE_ORDER: readonly WorkspaceRole[] = [
  'owner',
  'admin',
  'member',
  'viewer',
];

export type MemberStatus = 'active' | 'removed' | 'suspended';

export const memberStatus = (
  member: Pick<WorkspaceMemberSummary, 'deletedAt' | 'suspendedAt'>,
): MemberStatus => {
  if (member.deletedAt) return 'removed';
  if (member.suspendedAt) return 'suspended';
  return 'active';
};

export const isOwnerRole = (role?: string | null): boolean => role === 'owner';
export const isAdminRole = (role?: string | null): boolean => role === 'admin';

/** Whether the caller may invite anyone at all (workspace member/viewer roles). */
export const canInviteMembers = (callerRole?: string | null): boolean =>
  callerRole === 'owner' || callerRole === 'admin';

/**
 * Workspace roles the caller may grant on invite or through change-role.
 * Owner can grant everything except owner itself (ownership only moves via
 * `workspace.transferOwnership`); admin is limited to member/viewer; nobody
 * else grants roles.
 */
export const grantableWorkspaceRoles = (callerRole?: string | null): WorkspaceRole[] => {
  if (callerRole === 'owner') return ['admin', 'member', 'viewer'];
  if (callerRole === 'admin') return ['member', 'viewer'];
  return [];
};

export const canGrantRole = (callerRole: string | null | undefined, targetRole: string): boolean =>
  grantableWorkspaceRoles(callerRole).includes(targetRole as WorkspaceRole);

/**
 * Whether the caller may run member actions (change role / suspend / remove)
 * against a given row. Owner rows are protected for everyone — including the
 * owner, who must transfer ownership instead of editing the row. Callers
 * cannot act on themselves; leave() is the self path.
 */
export const canManageMember = (
  callerRole: string | null | undefined,
  target: { role: string; userId: string },
  callerUserId?: string,
): boolean => {
  if (target.role === 'owner') return false;
  if (callerUserId && target.userId === callerUserId) return false;
  if (callerRole === 'owner') return true;
  // Admin manages strictly below-admin roles — not other admins, not owner.
  if (callerRole === 'admin') return target.role === 'member' || target.role === 'viewer';
  return false;
};

/** Roles a caller may move THIS member to — ceiling-filtered for the menu. */
export const changeableRolesFor = (
  callerRole: string | null | undefined,
  targetRole: string,
): WorkspaceRole[] => grantableWorkspaceRoles(callerRole).filter((role) => role !== targetRole);

export const PROJECT_ROLE_ORDER: readonly ProjectRole[] = [
  'manager',
  'contributor',
  'commenter',
  'viewer',
];
