import { lambdaClient } from '@/libs/trpc/client';

import type {
  CollaborationRoom,
  CollaborationTicket,
  InviteBatchResult,
  ProjectMemberSummary,
  ProjectRole,
  RemovalPreview,
  WorkspaceAgentSummary,
  WorkspaceInvitationSummary,
  WorkspaceMembershipSummary,
  WorkspaceMemberSummary,
  WorkspaceRole,
} from './contract';

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
    checkSlugAvailable: QueryProc<{ slug: string }, { available: boolean }>;
    create: MutateProc<
      { avatar?: string; description?: string; name: string; slug: string },
      WorkspaceMembershipSummary
    >;
    list: QueryProc<void, WorkspaceMembershipSummary[]>;
    transferOwnership: MutateProc<{ newOwnerUserId: string }, void>;
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

export const teammatesClient = lambdaClient as unknown as TeammatesLambdaContract;
