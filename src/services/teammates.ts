import { lambdaClient } from '@/libs/trpc/client';

import type {
  CollaborationRoom,
  CollaborationTicket,
  InviteBatchResult,
  OwnershipTransferRequestResult,
  OwnershipTransferState,
  ProjectMemberSummary,
  ProjectRole,
  RemovalPreview,
  WorkspaceAgentSummary,
  WorkspaceInvitationSummary,
  WorkspaceMembershipSummary,
  WorkspaceMemberSummary,
  WorkspaceRole,
} from './teammatesContract';

/**
 * Typed surface of a tRPC vanilla client (`x.y.query` / `x.y.mutate`).
 * `lambdaClient` resolves procedure paths lazily through a proxy, so a cast to
 * the contract shape is the only seam needed while the OSS router stubs still
 * lack these procedures — every call below is a real request to the shared
 * contract path, never a stubbed response.
 */
interface QueryProc<I, O> {
  query: (input: I) => Promise<O>;
}

interface MutateProc<I, O> {
  mutate: (input: I) => Promise<O>;
}

export interface InviteInput {
  emails: string[];
  /**
   * Per-project roles requested alongside `projectIds`. The contract's
   * `projectIds` stays a plain id list; `projectRoles` carries the granular
   * mapping for backends that honor it (default 'contributor').
   */
  projectIds?: string[];
  projectRoles?: {
    projectId: string;
    role: ProjectRole;
  }[];
  role?: WorkspaceRole;
}

interface TeammatesLambdaContract {
  collaboration: {
    authorize: MutateProc<{ room: CollaborationRoom }, CollaborationTicket>;
    snapshot: QueryProc<
      { cursor?: string; room: CollaborationRoom },
      { activities: unknown[]; nextCursor?: string; presence: unknown[] }
    >;
  };
  invitation: {
    accept: MutateProc<{ token: string }, { alreadyMember: boolean; workspaceId: string }>;
    preview: QueryProc<
      { token: string },
      {
        acceptedByCurrentUser?: boolean;
        emailHint?: string;
        expiresAt: string;
        inviter: { avatar: string | null; name: string | null };
        projects: { id: string; name: string; role: string }[];
        role: string;
        status: string;
        workspace: { avatar: string | null; id: string; name: string };
      }
    >;
    resend: MutateProc<{ invitationId: string }, void>;
    revoke: MutateProc<{ invitationId: string }, void>;
  };
  projectMember: {
    add: MutateProc<{ projectId: string; role: ProjectRole; userId: string }, void>;
    changeRole: MutateProc<{ projectId: string; role: ProjectRole; userId: string }, void>;
    list: QueryProc<{ projectId: string }, ProjectMemberSummary[]>;
    remove: MutateProc<{ projectId: string; userId: string }, void>;
  };
  workspace: {
    cancelOwnershipTransfer: MutateProc<void, { cancelled: boolean }>;
    checkSlugAvailable: QueryProc<{ slug: string }, { available: boolean }>;
    create: MutateProc<
      { avatar?: string; description?: string; name: string; slug: string },
      WorkspaceMembershipSummary
    >;
    list: QueryProc<void, WorkspaceMembershipSummary[]>;
    pendingOwnershipTransfer: QueryProc<void, OwnershipTransferState | null>;
    respondOwnershipTransfer: MutateProc<{ accept: boolean }, { accepted: boolean }>;
    transferOwnership: MutateProc<{ newOwnerUserId: string }, OwnershipTransferRequestResult>;
  };
  workspaceAgent: {
    list: QueryProc<void, WorkspaceAgentSummary[]>;
  };
  workspaceMember: {
    changeRole: MutateProc<
      { expectedAuthzVersion?: number; role: WorkspaceRole; userId: string },
      void
    >;
    invite: MutateProc<InviteInput, InviteBatchResult>;
    leave: MutateProc<void, void>;
    list: QueryProc<{ includeDeleted?: boolean } | undefined, WorkspaceMemberSummary[]>;
    listInvitations: QueryProc<void, WorkspaceInvitationSummary[]>;
    removalPreview: QueryProc<{ userId: string }, RemovalPreview>;
    remove: MutateProc<{ reassignToUserId?: string; userId: string }, void>;
    resume: MutateProc<{ userId: string }, void>;
    suspend: MutateProc<{ userId: string }, void>;
  };
}

const client = lambdaClient as unknown as TeammatesLambdaContract;

export const teammatesService = {
  workspaceMember: {
    list: (...args: Parameters<typeof client.workspaceMember.list.query>) =>
      client.workspaceMember.list.query(...args),
    listInvitations: (...args: Parameters<typeof client.workspaceMember.listInvitations.query>) =>
      client.workspaceMember.listInvitations.query(...args),
    removalPreview: (...args: Parameters<typeof client.workspaceMember.removalPreview.query>) =>
      client.workspaceMember.removalPreview.query(...args),
    invite: (...args: Parameters<typeof client.workspaceMember.invite.mutate>) =>
      client.workspaceMember.invite.mutate(...args),
    changeRole: (...args: Parameters<typeof client.workspaceMember.changeRole.mutate>) =>
      client.workspaceMember.changeRole.mutate(...args),
    suspend: (...args: Parameters<typeof client.workspaceMember.suspend.mutate>) =>
      client.workspaceMember.suspend.mutate(...args),
    resume: (...args: Parameters<typeof client.workspaceMember.resume.mutate>) =>
      client.workspaceMember.resume.mutate(...args),
    remove: (...args: Parameters<typeof client.workspaceMember.remove.mutate>) =>
      client.workspaceMember.remove.mutate(...args),
    leave: (...args: Parameters<typeof client.workspaceMember.leave.mutate>) =>
      client.workspaceMember.leave.mutate(...args),
  },
  workspace: {
    pendingOwnershipTransfer: (
      ...args: Parameters<typeof client.workspace.pendingOwnershipTransfer.query>
    ) => client.workspace.pendingOwnershipTransfer.query(...args),
    transferOwnership: (...args: Parameters<typeof client.workspace.transferOwnership.mutate>) =>
      client.workspace.transferOwnership.mutate(...args),
    respondOwnershipTransfer: (
      ...args: Parameters<typeof client.workspace.respondOwnershipTransfer.mutate>
    ) => client.workspace.respondOwnershipTransfer.mutate(...args),
    cancelOwnershipTransfer: (
      ...args: Parameters<typeof client.workspace.cancelOwnershipTransfer.mutate>
    ) => client.workspace.cancelOwnershipTransfer.mutate(...args),
    list: (...args: Parameters<typeof client.workspace.list.query>) =>
      client.workspace.list.query(...args),
  },
  workspaceAgent: {
    list: (...args: Parameters<typeof client.workspaceAgent.list.query>) =>
      client.workspaceAgent.list.query(...args),
  },
  projectMember: {
    list: (...args: Parameters<typeof client.projectMember.list.query>) =>
      client.projectMember.list.query(...args),
    add: (...args: Parameters<typeof client.projectMember.add.mutate>) =>
      client.projectMember.add.mutate(...args),
    changeRole: (...args: Parameters<typeof client.projectMember.changeRole.mutate>) =>
      client.projectMember.changeRole.mutate(...args),
    remove: (...args: Parameters<typeof client.projectMember.remove.mutate>) =>
      client.projectMember.remove.mutate(...args),
  },
  invitation: {
    resend: (...args: Parameters<typeof client.invitation.resend.mutate>) =>
      client.invitation.resend.mutate(...args),
    revoke: (...args: Parameters<typeof client.invitation.revoke.mutate>) =>
      client.invitation.revoke.mutate(...args),
    preview: (...args: Parameters<typeof client.invitation.preview.query>) =>
      client.invitation.preview.query(...args),
    accept: (...args: Parameters<typeof client.invitation.accept.mutate>) =>
      client.invitation.accept.mutate(...args),
  },
  collaboration: {
    snapshot: (...args: Parameters<typeof client.collaboration.snapshot.query>) =>
      client.collaboration.snapshot.query(...args),
    authorize: (...args: Parameters<typeof client.collaboration.authorize.mutate>) =>
      client.collaboration.authorize.mutate(...args),
  },
};
