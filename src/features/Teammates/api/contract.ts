import type { WorkspaceItem } from '@orvilo/database/schemas';

/**
 * Client-side mirror of the teammates tRPC contract. The OSS lambda router
 * stubs do not expose the new procedures yet, so these interfaces pin the
 * request/response shapes the backend slices implement in parallel. Keep them
 * aligned with the shared contract rather than widening them locally.
 */

export type WorkspaceRole = 'admin' | 'member' | 'owner' | 'viewer';
export type ProjectRole = 'commenter' | 'contributor' | 'manager' | 'viewer';

/** `workspace.list` → workspace row + the caller's membership context. */
export interface WorkspaceMembershipSummary extends WorkspaceItem {
  lockedOut?: boolean;
  plan?: string;
  role: WorkspaceRole | null;
}

/** `workspaceMember.list` → membership row joined with the public profile. */
export interface WorkspaceMemberSummary {
  authzVersion?: number;
  deletedAt?: Date | null;
  joinedAt?: Date | string;
  role: WorkspaceRole;
  suspendedAt?: Date | null;
  user: {
    avatar: string | null;
    email: string | null;
    fullName: string | null;
    username: string | null;
  } | null;
  userId: string;
  workspaceId?: string;
}

/** `workspaceMember.invite` → per-email delivery report for the batch. */
export interface InviteBatchResult {
  results: {
    email: string;
    error?: string;
    invitationId?: string;
    ok: boolean;
  }[];
}

/** `workspaceMember.listInvitations` → invitation row + display context. */
export interface WorkspaceInvitationSummary {
  createdAt: Date | string;
  email: string;
  expiresAt: Date | string;
  generation?: number;
  id: string;
  inviter: {
    avatar: string | null;
    id: string;
    name: string | null;
  } | null;
  lastSentAt?: Date | string | null;
  projects: {
    projectId: string;
    role: ProjectRole;
  }[];
  role: WorkspaceRole;
  status: 'accepted' | 'expired' | 'pending' | 'revoked';
}

/** `workspaceMember.removalPreview` → what removing this member disturbs. */
export interface RemovalPreview {
  assignedTaskCount: number;
  assignedTasks: {
    id: string;
    title: string;
  }[];
  reviewingTaskCount: number;
  runningDelegationCount: number;
  sharedDeviceCount: number;
}

/** `projectMember.list` → project membership row + public profile. */
export interface ProjectMemberSummary {
  projectId: string;
  role: ProjectRole;
  user?: {
    avatar: string | null;
    email: string | null;
    fullName: string | null;
    username: string | null;
  } | null;
  userId: string;
}

/** `collaboration.authorize` → short-lived room ticket. */
export interface CollaborationTicket {
  expiresAt: string;
  gatewayUrl: string;
  token: string;
}

export type CollaborationRoomScope = 'project' | 'task' | 'workspace';

export interface CollaborationRoom {
  id: string;
  scope: CollaborationRoomScope;
}

/**
 * `workspaceAgent.list` → workspace-visible agents. Read-only in v1: the
 * roster answers "who's here and usable where", not lifecycle management.
 */
export interface WorkspaceAgentSummary {
  avatar?: string | null;
  id: string;
  maintainer?: {
    avatar: string | null;
    id: string;
    name: string | null;
  } | null;
  name: string;
  projects?: {
    id: string;
    name: string;
  }[];
  status?: 'active' | 'disabled';
}
