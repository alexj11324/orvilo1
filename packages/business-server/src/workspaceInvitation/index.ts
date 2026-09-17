import { INVITATION_EXPIRY_DAYS } from '@orvilo/const';
import type { LobeChatDatabase } from '@orvilo/database';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ProjectMemberModel } from '@/database/models/projectMember';
import { UserModel } from '@/database/models/user';
import { WorkspaceInvitationModel } from '@/database/models/workspaceInvitation';
import { WorkspaceMemberModel } from '@/database/models/workspaceMember';
import { WorkspaceModel } from '@/database/models/workspace';

import {
  canGrantWorkspaceRole,
  capProjectRole,
  isWorkspaceRoleName,
  type ProjectRoleName,
  type WorkspaceRoleName,
} from '../membershipLifecycle/roles';
import {
  findProjectsByIds,
  findUserById,
  findUsersByNormalizedEmail,
  lockMembershipForUpdate,
  lockWorkspaceForUpdate,
} from '../membershipLifecycle/queries';
import { emitWorkspaceEvent, recordAudit } from '../membershipLifecycle/audit';
import { maskEmail, sendInvitationEmail } from './email';
import {
  listInvitationProjectGrants,
  listRecentTerminalInvitations,
  markInvitationSent,
} from './queries';

const INVITABLE_ROLES = ['admin', 'member', 'viewer'] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

export interface InviteResultItem {
  email: string;
  error?: string;
  invitationId?: string;
  ok: boolean;
}

export interface InvitationListItem {
  createdAt: Date | null;
  email: string | null;
  expiresAt: Date;
  generation: number;
  id: string;
  inviter: { avatar: string | null; id: string; name: string | null } | null;
  lastSentAt: Date | null;
  projects: Array<{ projectId: string; role: string }>;
  role: string;
  status: string;
}

export interface InvitationPreview {
  acceptedByCurrentUser: boolean;
  emailHint: string;
  expiresAt: Date;
  inviter: { avatar: string | null; name: string | null };
  projects: Array<{ id: string; name: string; role: string }>;
  role: string;
  status: string;
  workspace: { avatar: string | null; id: string; name: string };
}

const emailFormat = z.email();

const isExpired = (invitation: { expiresAt: Date }) =>
  invitation.expiresAt.getTime() <= Date.now();

/** Bounded retries for transaction serialization failures (lock-order contention). */
const withRetry = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  for (let i = 0; ; i += 1) {
    try {
      return await fn();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if ((code === '40001' || code === '40P01') && i < attempts - 1) continue;
      throw error;
    }
  }
};

const toInvitationListItem = (
  invitation: {
    createdAt: Date | null;
    emailNormalized: string | null;
    expiresAt: Date;
    generation: number;
    id: string;
    inviterId: string;
    lastSentAt: Date | null;
    role: string;
    status: string;
  },
  inviters: Map<string, { avatar: string | null; fullName: string | null; username: string | null }>,
  grants: Map<string, Array<{ projectId: string; role: string }>>,
): InvitationListItem => {
  const inviter = inviters.get(invitation.inviterId);
  return {
    createdAt: invitation.createdAt,
    email: invitation.emailNormalized,
    expiresAt: invitation.expiresAt,
    generation: invitation.generation,
    id: invitation.id,
    inviter: inviter
      ? {
          avatar: inviter.avatar,
          id: invitation.inviterId,
          name: inviter.fullName ?? inviter.username,
        }
      : null,
    lastSentAt: invitation.lastSentAt,
    projects: grants.get(invitation.id) ?? [],
    role: invitation.role,
    status: invitation.status,
  };
};

/**
 * Batch invite: every email gets an isolated result — one failure never rolls
 * back siblings. Each successful invite is one transaction carrying the row,
 * its audit record and the outbox event; the email send runs after commit so
 * a delivery failure can never poison business state.
 */
export const issueInvitations = async (
  db: LobeChatDatabase,
  params: {
    emails: string[];
    ipAddress?: string;
    inviterRole: WorkspaceRoleName | null;
    inviterUserId: string;
    projectIds?: string[];
    projectRoles?: { projectId: string; role: ProjectRoleName }[];
    role: InvitableRole;
    workspaceId: string;
  },
): Promise<{ results: InviteResultItem[] }> => {
  if (!canGrantWorkspaceRole(params.inviterRole, params.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your workspace role cannot grant the requested role',
    });
  }

  const workspace = await new WorkspaceModel(db, params.inviterUserId).findById(params.workspaceId);
  if (!workspace) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
  const inviter = await findUserById(db, params.inviterUserId);

  // Validate project grants once: every project must live in this workspace and
  // the inviter must be allowed to grant access to it. Private projects stay
  // grantable only by their creator — admin status is not a bypass.
  const projectIds = [...new Set(params.projectIds ?? [])];
  let projectGrants: Array<{ projectId: string; role: ProjectRoleName }> = [];
  if (projectIds.length > 0) {
    const rows = await findProjectsByIds(db, projectIds);
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const projectId of projectIds) {
      const project = byId.get(projectId);
      if (!project || project.workspaceId !== params.workspaceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Every projectId must belong to this workspace',
        });
      }
      if (project.visibility === 'private' && project.userId !== params.inviterUserId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the project owner can grant access to a private project',
        });
      }
    }
    const requestedRoles = new Map(
      (params.projectRoles ?? []).map((entry) => [entry.projectId, entry.role]),
    );
    projectGrants = projectIds.map((projectId) => ({
      projectId,
      role: capProjectRole(params.role, requestedRoles.get(projectId) ?? 'contributor'),
    }));
  }

  const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 86_400_000);
  const memberModel = new WorkspaceMemberModel(db, params.inviterUserId);
  const pending = await new WorkspaceInvitationModel(db, params.inviterUserId).listPendingByWorkspace(
    params.workspaceId,
  );
  const pendingEmails = new Set(pending.map((row) => row.invitation.emailNormalized));

  const results: InviteResultItem[] = [];
  for (const rawEmail of params.emails) {
    const emailNormalized = WorkspaceInvitationModel.normalizeEmail(rawEmail);
    const fail = (error: string): InviteResultItem => ({ email: rawEmail, error, ok: false });

    if (!emailFormat.safeParse(emailNormalized).success) {
      results.push(fail('invalid-email'));
      continue;
    }
    if (pendingEmails.has(emailNormalized)) {
      results.push(fail('already-invited'));
      continue;
    }

    const candidates = await findUsersByNormalizedEmail(db, emailNormalized);
    let alreadyMember = false;
    for (const candidate of candidates) {
      if (await memberModel.getMember(params.workspaceId, candidate.id)) {
        alreadyMember = true;
        break;
      }
    }
    if (alreadyMember) {
      results.push(fail('already-member'));
      continue;
    }

    try {
      const { invitation, token } = await db.transaction(async (tx) => {
        const created = await new WorkspaceInvitationModel(tx, params.inviterUserId).createInvitation({
          emailNormalized,
          expiresAt,
          inviterId: params.inviterUserId,
          projectGrants,
          role: params.role,
          workspaceId: params.workspaceId,
        });
        await recordAudit(tx, {
          action: 'member.invited',
          ipAddress: params.ipAddress,
          metadata: { email: emailNormalized, projectIds, role: params.role },
          resourceId: created.invitation.id,
          resourceType: 'workspace_invitation',
          userId: params.inviterUserId,
          workspaceId: params.workspaceId,
        });
        await emitWorkspaceEvent(tx, {
          aggregateId: params.workspaceId,
          aggregateType: 'workspace',
          eventType: 'workspace.invitation.created',
          payload: { invitationId: created.invitation.id },
          workspaceId: params.workspaceId,
        });
        return created;
      });

      const sent = await sendInvitationEmail({
        inviterEmail: inviter?.email,
        inviterName: inviter?.fullName ?? inviter?.username,
        role: params.role,
        to: emailNormalized,
        token,
        workspaceName: workspace.name,
      });
      if (sent) await markInvitationSent(db, invitation.id, new Date());
      results.push({ email: rawEmail, invitationId: invitation.id, ok: true });
    } catch (error) {
      console.error('[workspaceInvitation:issueInvitations]', error);
      results.push(fail('invite-failed'));
    }
  }
  return { results };
};

export const listInvitations = async (
  db: LobeChatDatabase,
  params: { actorUserId: string; workspaceId: string },
): Promise<InvitationListItem[]> => {
  const invitationModel = new WorkspaceInvitationModel(db, params.actorUserId);
  const [pending, terminal] = await Promise.all([
    invitationModel.listPendingByWorkspace(params.workspaceId),
    listRecentTerminalInvitations(db, params.workspaceId),
  ]);
  const pendingRows = pending.map((row) => row.invitation);
  const all = [...pendingRows, ...terminal];
  if (all.length === 0) return [];

  // Pending rows arrive with their grants; terminal rows need the join.
  const grantsByInvitation = new Map<string, Array<{ projectId: string; role: string }>>();
  for (const row of pending) {
    grantsByInvitation.set(
      row.invitation.id,
      row.projectGrants.map((grant) => ({ projectId: grant.projectId, role: grant.role })),
    );
  }
  const terminalGrants = await listInvitationProjectGrants(
    db,
    terminal.map((row) => row.id),
  );
  for (const grant of terminalGrants) {
    const list = grantsByInvitation.get(grant.invitationId) ?? [];
    list.push({ projectId: grant.projectId, role: grant.role });
    grantsByInvitation.set(grant.invitationId, list);
  }

  const inviterIds = [...new Set(all.map((row) => row.inviterId))];
  const inviters = new Map(
    (await UserModel.getDisplayInfoByIds(db, inviterIds)).map((user) => [user.id, user]),
  );

  return all.map((row) => toInvitationListItem(row, inviters, grantsByInvitation));
};

/**
 * Token landing-page read: enough context to decide to join, nothing more.
 * The raw token and full project detail stay server-side; the email is masked.
 */
export const previewInvitation = async (
  db: LobeChatDatabase,
  params: { token: string; userId: string },
): Promise<InvitationPreview> => {
  const invitation = await new WorkspaceInvitationModel(db, params.userId).findByToken(params.token);
  if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });

  // Expired links are a hard error; revoked/accepted still render a preview
  // with their terminal status so the landing page can say what happened.
  if (invitation.status === 'expired' || (invitation.status === 'pending' && isExpired(invitation))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation expired' });
  }
  if (!['pending', 'accepted', 'revoked'].includes(invitation.status)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Invitation ${invitation.status}` });
  }

  const workspace = await new WorkspaceModel(db, params.userId).findById(invitation.workspaceId);
  if (!workspace) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found' });
  const inviter = await findUserById(db, invitation.inviterId);
  const grants = await listInvitationProjectGrants(db, [invitation.id]);

  return {
    acceptedByCurrentUser: invitation.status === 'accepted' && invitation.acceptedBy === params.userId,
    emailHint: maskEmail(invitation.emailNormalized),
    expiresAt: invitation.expiresAt,
    inviter: {
      avatar: inviter?.avatar ?? null,
      name: inviter?.fullName ?? inviter?.username ?? null,
    },
    projects: grants.map((grant) => ({
      id: grant.projectId,
      name: grant.projectName ?? grant.projectId,
      role: grant.role,
    })),
    role: invitation.role,
    status: invitation.status,
    workspace: { avatar: workspace.avatar, id: workspace.id, name: workspace.name },
  };
};

/**
 * THE accept transaction. Lock order workspace → invitation → membership, all
 * checks re-verified under the invitation row lock, single-consume via the
 * conditional markAccepted. Email is verified against the account's own auth
 * record — never a client-claimed address.
 */
export const acceptInvitation = async (
  db: LobeChatDatabase,
  params: { ipAddress?: string; token: string; userId: string },
): Promise<{ alreadyMember: boolean; workspaceId: string }> => {
  const invitationModel = new WorkspaceInvitationModel(db, params.userId);
  const found = await invitationModel.findByToken(params.token);
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });

  // Fast-path terminal states before opening the transaction; they are
  // re-verified under the row lock below.
  if (found.status === 'revoked') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation revoked' });
  }
  if (found.status === 'accepted') {
    if (found.acceptedBy === params.userId) {
      return { alreadyMember: true, workspaceId: found.workspaceId };
    }
    throw new TRPCError({ code: 'CONFLICT', message: 'Invitation already used' });
  }
  if (found.status !== 'pending' || isExpired(found)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation expired' });
  }

  return withRetry(() =>
    db.transaction(async (tx) => {
      await lockWorkspaceForUpdate(tx, found.workspaceId);
      const invitation = await new WorkspaceInvitationModel(tx, params.userId).lockForUpdate(found.id);
      if (!invitation || invitation.status !== 'pending') {
        throw new TRPCError({ code: 'CONFLICT', message: 'Invitation already used' });
      }
      if (isExpired(invitation)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation expired' });
      }

      // The caller's own verified email decides eligibility — never a
      // client-claimed address. Mismatch asks for an account switch without
      // leaking the invited project scope. The stored normalized_email wins
      // when present; older rows fall back to normalizing on the fly. Legacy
      // link-only invitations (no bound email) still demand a verified
      // account — the bearer token alone is no longer enough to freeload on.
      const account = await findUserById(tx, params.userId);
      const verified = Boolean(account?.emailVerified) || account?.emailVerifiedAt != null;
      const accountEmail =
        account?.normalizedEmail ??
        (account?.email ? WorkspaceInvitationModel.normalizeEmail(account.email) : null);
      if (!verified) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Verify your account email before accepting this invitation',
        });
      }
      if (invitation.emailNormalized && accountEmail !== invitation.emailNormalized) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This invitation is bound to a different email — sign in with that account',
        });
      }

      // Re-verify the inviter can still confer this role right now: an inviter
      // who left or was demoted cannot keep granting through old invitations.
      const inviterMembership = await new WorkspaceMemberModel(tx, params.userId).getMember(
        found.workspaceId,
        invitation.inviterId,
      );
      const inviterRole = inviterMembership?.role;
      const inviterActive = inviterMembership && inviterMembership.suspendedAt === null;
      if (
        !inviterActive ||
        !isWorkspaceRoleName(inviterRole) ||
        !canGrantWorkspaceRole(inviterRole, invitation.role as WorkspaceRoleName)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'The inviter can no longer grant this role — ask for a new invitation',
        });
      }

      const memberModel = new WorkspaceMemberModel(tx, params.userId);
      const projectMemberModel = new ProjectMemberModel(tx, params.userId);
      const existing = await lockMembershipForUpdate(tx, found.workspaceId, params.userId);
      let alreadyMember = false;

      if (existing && existing.deletedAt === null) {
        // Idempotent re-join: never overwrite an active member's role or
        // accumulated grants. The invitation is still consumed below.
        alreadyMember = true;
      } else {
        // Fresh join or re-join after removal: only this invitation's scope is
        // restored — removed members never resurrect old grants.
        await memberModel.addMember({
          role: invitation.role as InvitableRole,
          userId: params.userId,
          workspaceId: found.workspaceId,
        });
        const grants = await listInvitationProjectGrants(tx, [invitation.id]);
        for (const grant of grants) {
          const held = await projectMemberModel.getRole(grant.projectId, params.userId);
          if (held === null || held === undefined) {
            await projectMemberModel.add({
              projectId: grant.projectId,
              role: capProjectRole(invitation.role as WorkspaceRoleName, grant.role as ProjectRoleName),
              userId: params.userId,
              workspaceId: found.workspaceId,
            });
          }
        }
      }

      // Conditional single-consume: status must still be pending AND the
      // generation the presented token resolved to must still be current — a
      // resend mid-flight invalidates this accept exactly like a replay.
      const marked = await new WorkspaceInvitationModel(tx, params.userId).markAccepted(
        invitation.id,
        { acceptedBy: params.userId, generation: found.generation },
      );
      if (!marked) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Invitation already used' });
      }

      await recordAudit(tx, {
        action: 'member.joined',
        ipAddress: params.ipAddress,
        metadata: { alreadyMember, invitationId: invitation.id },
        resourceId: invitation.id,
        resourceType: 'workspace_invitation',
        userId: params.userId,
        workspaceId: found.workspaceId,
      });
      await emitWorkspaceEvent(tx, {
        aggregateId: found.workspaceId,
        aggregateType: 'workspace',
        eventType: 'workspace.invitation.accepted',
        payload: { invitationId: invitation.id, userId: params.userId },
        workspaceId: found.workspaceId,
      });

      return { alreadyMember, workspaceId: found.workspaceId };
    }),
  );
};

const assertInvitationWorkspaceAdmin = async (
  db: LobeChatDatabase,
  workspaceId: string,
  actorUserId: string,
) => {
  const membership = await new WorkspaceMemberModel(db, actorUserId).getMember(
    workspaceId,
    actorUserId,
  );
  if (
    !membership ||
    membership.suspendedAt !== null ||
    (membership.role !== 'owner' && membership.role !== 'admin')
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only a workspace admin can manage invitations',
    });
  }
  return membership;
};

/**
 * Resend rotates the token: the old link dies with this generation so a leaked
 * or forwarded email cannot keep working. Same pending row, same audit trail.
 */
export const resendInvitation = async (
  db: LobeChatDatabase,
  params: { actorUserId: string; invitationId: string; ipAddress?: string },
): Promise<{ emailed: boolean; generation: number; invitationId: string }> => {
  const invitation = await new WorkspaceInvitationModel(db, params.actorUserId).findById(
    params.invitationId,
  );
  if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
  await assertInvitationWorkspaceAdmin(db, invitation.workspaceId, params.actorUserId);
  if (invitation.status !== 'pending') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only a pending invitation can be resent' });
  }
  if (isExpired(invitation)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation expired — issue a new one' });
  }
  if (!invitation.emailNormalized) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has no recipient email' });
  }

  const { generation, token } = await db.transaction(async (tx) => {
    // Lock the row so concurrent resends serialize instead of clobbering each
    // other's tokenHash — the second one sees the same pending row and rotates
    // again, which would silently kill the first resend's mailed link.
    const locked = await new WorkspaceInvitationModel(tx, params.actorUserId).lockForUpdate(
      invitation.id,
    );
    if (!locked || locked.status !== 'pending') {
      throw new TRPCError({ code: 'CONFLICT', message: 'Invitation is no longer pending' });
    }
    if (isExpired(locked)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation expired — issue a new one' });
    }

    const token = await new WorkspaceInvitationModel(tx, params.actorUserId).rotateToken(
      invitation.id,
    );
    if (!token) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Invitation is no longer pending' });
    }

    const rotated = await new WorkspaceInvitationModel(tx, params.actorUserId).lockForUpdate(
      invitation.id,
    );
    const generation = rotated?.generation ?? locked.generation + 1;

    await recordAudit(tx, {
      action: 'invitation.resent',
      ipAddress: params.ipAddress,
      metadata: { generation },
      resourceId: invitation.id,
      resourceType: 'workspace_invitation',
      userId: params.actorUserId,
      workspaceId: invitation.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: invitation.workspaceId,
      aggregateType: 'workspace',
      eventType: 'workspace.invitation.resent',
      payload: { invitationId: invitation.id },
      workspaceId: invitation.workspaceId,
    });
    return { generation, token };
  });

  const workspace = await new WorkspaceModel(db, params.actorUserId).findById(invitation.workspaceId);
  const inviter = await findUserById(db, invitation.inviterId);
  const emailed = await sendInvitationEmail({
    inviterEmail: inviter?.email,
    inviterName: inviter?.fullName ?? inviter?.username,
    role: invitation.role,
    to: invitation.emailNormalized,
    token,
    workspaceName: workspace?.name ?? 'workspace',
  });
  if (emailed) await markInvitationSent(db, invitation.id, new Date());

  return { emailed, generation, invitationId: invitation.id };
};

export const revokeInvitation = async (
  db: LobeChatDatabase,
  params: { actorUserId: string; invitationId: string; ipAddress?: string },
): Promise<{ invitationId: string; revoked: boolean }> => {
  const invitation = await new WorkspaceInvitationModel(db, params.actorUserId).findById(
    params.invitationId,
  );
  if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found' });
  await assertInvitationWorkspaceAdmin(db, invitation.workspaceId, params.actorUserId);

  await db.transaction(async (tx) => {
    // Conditional pending → revoked under the row lock: a concurrent accept
    // and revoke can never both succeed.
    const locked = await new WorkspaceInvitationModel(tx, params.actorUserId).lockForUpdate(
      invitation.id,
    );
    if (!locked || locked.status !== 'pending') {
      throw new TRPCError({ code: 'CONFLICT', message: 'Invitation is no longer pending' });
    }
    const revoked = await new WorkspaceInvitationModel(tx, params.actorUserId).revoke(
      invitation.id,
      { revokedBy: params.actorUserId },
    );
    if (!revoked) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Invitation is no longer pending' });
    }
    await recordAudit(tx, {
      action: 'invitation.revoked',
      ipAddress: params.ipAddress,
      resourceId: invitation.id,
      resourceType: 'workspace_invitation',
      userId: params.actorUserId,
      workspaceId: invitation.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: invitation.workspaceId,
      aggregateType: 'workspace',
      eventType: 'workspace.invitation.revoked',
      payload: { invitationId: invitation.id },
      workspaceId: invitation.workspaceId,
    });
  });

  return { invitationId: invitation.id, revoked: true };
};
