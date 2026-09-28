/**
 * Workspace/project role algebra shared by the membership, invitation and
 * project-membership services. Workspace roles rank owner > admin > member >
 * viewer; project roles rank manager > contributor > commenter > viewer.
 */
export type WorkspaceRoleName = 'admin' | 'member' | 'owner' | 'viewer';

export type ProjectRoleName = 'commenter' | 'contributor' | 'manager' | 'viewer';

const WORKSPACE_ROLE_RANK: Record<WorkspaceRoleName, number> = {
  admin: 2,
  member: 1,
  owner: 3,
  viewer: 0,
};

const PROJECT_ROLE_RANK: Record<ProjectRoleName, number> = {
  commenter: 1,
  contributor: 2,
  manager: 3,
  viewer: 0,
};

export const isWorkspaceRoleName = (value: unknown): value is WorkspaceRoleName =>
  typeof value === 'string' && value in WORKSPACE_ROLE_RANK;

/** Project roles an invite may carry for project grants. */
export const PROJECT_ROLE_NAMES: readonly ProjectRoleName[] = [
  'manager',
  'contributor',
  'commenter',
  'viewer',
];

/**
 * Whether a caller holding `callerRole` may grant `grantRole` to somebody else
 * (invite or role change). Only an owner confers admin; admins confer
 * member/viewer; members and viewers confer nothing.
 */
export const canGrantWorkspaceRole = (
  callerRole: WorkspaceRoleName | null | undefined,
  grantRole: WorkspaceRoleName,
): boolean => {
  if (grantRole === 'owner') return false;
  if (callerRole === 'owner') return true;
  if (callerRole === 'admin') return grantRole === 'member' || grantRole === 'viewer';
  return false;
};

/**
 * Whether a caller holding `callerRole` may change, suspend or remove a member
 * currently holding `targetRole`. Nobody manages the owner; admins manage only
 * member/viewer.
 */
export const canManageMember = (
  callerRole: WorkspaceRoleName | null | undefined,
  targetRole: WorkspaceRoleName,
): boolean => {
  if (targetRole === 'owner') return false;
  if (callerRole === 'owner') return true;
  if (callerRole === 'admin') return targetRole === 'member' || targetRole === 'viewer';
  return false;
};

/**
 * The highest project role a member with `workspaceRole` may hold. A workspace
 * viewer is capped at commenter — a project 'manager' label must never restore
 * write ability the workspace role withholds.
 */
export const maxProjectRoleForWorkspaceRole = (
  workspaceRole: WorkspaceRoleName | null | undefined,
): ProjectRoleName => (workspaceRole === 'viewer' ? 'commenter' : 'manager');

/** Clamp `requested` to the ceiling implied by the member's workspace role. */
export const capProjectRole = (
  workspaceRole: WorkspaceRoleName | null | undefined,
  requested: ProjectRoleName,
): ProjectRoleName => {
  const ceiling = maxProjectRoleForWorkspaceRole(workspaceRole);
  return PROJECT_ROLE_RANK[requested] > PROJECT_ROLE_RANK[ceiling] ? ceiling : requested;
};

/**
 * Whether the caller may manage members of a project: a workspace owner/admin,
 * or a project manager whose workspace role still carries write ability
 * (a workspace viewer's 'manager' label grants nothing).
 */
export const canManageProjectMembers = (
  callerWorkspaceRole: WorkspaceRoleName | null | undefined,
  callerProjectRole: string | null | undefined,
): boolean => {
  if (callerWorkspaceRole === 'owner' || callerWorkspaceRole === 'admin') return true;
  if (callerWorkspaceRole === 'viewer') return false;
  return callerProjectRole === 'manager';
};
