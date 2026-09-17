import type { LobeChatDatabase } from '@orvilo/database';
import type { WorkspaceMemberItem } from '@orvilo/database/schemas';
import { TRPCError } from '@trpc/server';

import { WorkspaceMemberModel } from '@/database/models/workspaceMember';
import { WorkspaceModel } from '@/database/models/workspace';

import { emitWorkspaceEvent, recordAudit } from './audit';
import {
  bumpAuthzVersion,
  countActiveDelegations,
  countMemberBoundDevices,
  countOpenTasksAssignedTo,
  countOpenTasksReviewedBy,
  listMembersWithProfiles,
  listOpenAssignedTaskTitles,
  lockMembershipForUpdate,
  lockWorkspaceForUpdate,
  reassignOpenAssignedTasks,
} from './queries';
import { canGrantWorkspaceRole, canManageMember, type WorkspaceRoleName } from './roles';

export interface MemberSummary extends WorkspaceMemberItem {
  user: {
    avatar: string | null;
    email: string | null;
    fullName: string | null;
    username: string | null;
  } | null;
}

export interface MemberRemovalPreview {
  assignedTaskCount: number;
  assignedTasks: Array<{ id: string; title: string }>;
  reviewingTaskCount: number;
  runningDelegationCount: number;
  sharedDeviceCount: number;
}

const activeMembership = (member: WorkspaceMemberItem | undefined) =>
  member && member.deletedAt === null ? member : undefined;

/**
 * Member directory for the workspace. Emails ride along only for owner/admin
 * viewers — everyone else gets the same profile with `email: null`.
 */
export const listMemberSummaries = async (
  db: LobeChatDatabase,
  params: { includeDeleted: boolean; viewerIsAdmin: boolean; workspaceId: string },
): Promise<MemberSummary[]> => {
  const rows = await listMembersWithProfiles(db, params.workspaceId, params.includeDeleted);
  return rows.map(({ member, user }) => ({
    ...member,
    user: user
      ? {
          avatar: user.avatar,
          email: params.viewerIsAdmin ? user.email : null,
          fullName: user.fullName,
          username: user.username,
        }
      : null,
  }));
};

export const changeMemberRole = async (
  db: LobeChatDatabase,
  params: {
    actorRole: WorkspaceRoleName | null;
    actorUserId: string;
    expectedAuthzVersion?: number;
    ipAddress?: string;
    role: Exclude<WorkspaceRoleName, 'owner'>;
    targetUserId: string;
    workspaceId: string;
  },
) => {
  return db.transaction(async (tx) => {
    await lockWorkspaceForUpdate(tx, params.workspaceId);
    const memberModel = new WorkspaceMemberModel(tx, params.actorUserId);
    const target = activeMembership(
      await lockMembershipForUpdate(tx, params.workspaceId, params.targetUserId),
    );
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not an active member' });
    if (params.targetUserId === params.actorUserId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot change your own role' });
    }
    if (target.role === 'owner') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'The owner role can only change through transferOwnership',
      });
    }
    if (params.actorRole === 'admin' && target.role === 'admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Admins cannot change other admins' });
    }
    if (!canGrantWorkspaceRole(params.actorRole, params.role)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Requested role exceeds your grant ceiling',
      });
    }
    if (
      params.expectedAuthzVersion !== undefined &&
      target.authzVersion !== params.expectedAuthzVersion
    ) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Membership version mismatch — refresh and retry',
      });
    }
    if (target.role === params.role) return { changed: false as const, role: target.role };

    await memberModel.updateMemberRole(params.workspaceId, params.targetUserId, params.role);
    await bumpAuthzVersion(tx, params.workspaceId, params.targetUserId);
    await recordAudit(tx, {
      action: 'member.role_changed',
      ipAddress: params.ipAddress,
      metadata: { fromRole: target.role, toRole: params.role },
      resourceId: params.targetUserId,
      resourceType: 'workspace_member',
      userId: params.actorUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.targetUserId,
      aggregateType: 'workspace_member',
      eventType: 'workspace.member.role_changed',
      payload: { role: params.role, userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });
    return { changed: true as const, role: params.role };
  });
};

const setMemberSuspended = async (
  db: LobeChatDatabase,
  params: {
    actorRole: WorkspaceRoleName | null;
    actorUserId: string;
    ipAddress?: string;
    suspended: boolean;
    targetUserId: string;
    workspaceId: string;
  },
) => {
  return db.transaction(async (tx) => {
    await lockWorkspaceForUpdate(tx, params.workspaceId);
    const memberModel = new WorkspaceMemberModel(tx, params.actorUserId);
    const target = activeMembership(
      await lockMembershipForUpdate(tx, params.workspaceId, params.targetUserId),
    );
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not an active member' });
    if (params.targetUserId === params.actorUserId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot suspend your own membership' });
    }
    if (target.role === 'owner') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'The owner cannot be suspended' });
    }
    if (!canManageMember(params.actorRole, target.role as WorkspaceRoleName)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You can only suspend members below your role',
      });
    }

    const alreadySuspended = target.suspendedAt !== null;
    if (alreadySuspended === params.suspended) {
      return { changed: false as const, suspended: params.suspended };
    }

    // The model's conditional write bumps authzVersion with the flag flip.
    if (params.suspended) {
      await memberModel.suspendMember(params.workspaceId, params.targetUserId);
    } else {
      await memberModel.resumeMember(params.workspaceId, params.targetUserId);
    }
    const action = params.suspended ? 'member.suspended' : 'member.resumed';
    await recordAudit(tx, {
      action,
      ipAddress: params.ipAddress,
      resourceId: params.targetUserId,
      resourceType: 'workspace_member',
      userId: params.actorUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.targetUserId,
      aggregateType: 'workspace_member',
      eventType: `workspace.${action}`,
      payload: { userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });
    return { changed: true as const, suspended: params.suspended };
  });
};

export const suspendMember = (
  db: LobeChatDatabase,
  params: Omit<Parameters<typeof setMemberSuspended>[1], 'suspended'>,
) => setMemberSuspended(db, { ...params, suspended: true });

export const resumeMember = (
  db: LobeChatDatabase,
  params: Omit<Parameters<typeof setMemberSuspended>[1], 'suspended'>,
) => setMemberSuspended(db, { ...params, suspended: false });

export const previewMemberRemoval = async (
  db: LobeChatDatabase,
  params: { targetUserId: string; workspaceId: string },
): Promise<MemberRemovalPreview> => {
  const member = await new WorkspaceMemberModel(db, params.targetUserId).getMember(
    params.workspaceId,
    params.targetUserId,
  );
  if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not an active member' });

  const [
    assignedTaskCount,
    reviewingTaskCount,
    runningDelegationCount,
    sharedDeviceCount,
    assignedTasks,
  ] = await Promise.all([
    countOpenTasksAssignedTo(db, params.workspaceId, params.targetUserId),
    countOpenTasksReviewedBy(db, params.workspaceId, params.targetUserId),
    countActiveDelegations(db, params.workspaceId, params.targetUserId),
    countMemberBoundDevices(db, params.workspaceId, params.targetUserId),
    listOpenAssignedTaskTitles(db, params.workspaceId, params.targetUserId),
  ]);

  return {
    assignedTaskCount,
    assignedTasks,
    reviewingTaskCount,
    runningDelegationCount,
    sharedDeviceCount,
  };
};

export const removeMember = async (
  db: LobeChatDatabase,
  params: {
    actorRole: WorkspaceRoleName | null;
    actorUserId: string;
    ipAddress?: string;
    reassignToUserId?: string;
    targetUserId: string;
    workspaceId: string;
  },
) => {
  return db.transaction(async (tx) => {
    await lockWorkspaceForUpdate(tx, params.workspaceId);
    const memberModel = new WorkspaceMemberModel(tx, params.actorUserId);
    const target = activeMembership(
      await lockMembershipForUpdate(tx, params.workspaceId, params.targetUserId),
    );
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not an active member' });
    if (params.targetUserId === params.actorUserId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Use leave to remove your own membership',
      });
    }
    if (target.role === 'owner') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The owner cannot be removed — transfer ownership first',
      });
    }
    if (!canManageMember(params.actorRole, target.role as WorkspaceRoleName)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You can only remove members below your role',
      });
    }

    if (params.reassignToUserId) {
      if (params.reassignToUserId === params.targetUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot reassign tasks to the member being removed',
        });
      }
      const reassignTarget = await memberModel.getMember(
        params.workspaceId,
        params.reassignToUserId,
      );
      if (!reassignTarget) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'reassignToUserId must be an active member of this workspace',
        });
      }
    }

    const reassignedTaskCount = params.reassignToUserId
      ? await reassignOpenAssignedTasks(tx, {
          fromUserId: params.targetUserId,
          toUserId: params.reassignToUserId,
          workspaceId: params.workspaceId,
        })
      : 0;

    const { removedDeviceIds } = await memberModel.removeMember(
      params.workspaceId,
      params.targetUserId,
    );

    await recordAudit(tx, {
      action: 'member.removed',
      ipAddress: params.ipAddress,
      metadata: {
        reassignedTaskCount,
        reassignToUserId: params.reassignToUserId ?? null,
        removedDeviceIds,
      },
      resourceId: params.targetUserId,
      resourceType: 'workspace_member',
      userId: params.actorUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.targetUserId,
      aggregateType: 'workspace_member',
      eventType: 'workspace.member.removed',
      payload: { userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });

    return { reassignedTaskCount, removedDeviceIds };
  });
};

export const leaveWorkspace = async (
  db: LobeChatDatabase,
  params: { ipAddress?: string; userId: string; workspaceId: string },
) => {
  return db.transaction(async (tx) => {
    await lockWorkspaceForUpdate(tx, params.workspaceId);
    const memberModel = new WorkspaceMemberModel(tx, params.userId);
    const target = activeMembership(
      await lockMembershipForUpdate(tx, params.workspaceId, params.userId),
    );
    if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not an active member' });
    if (target.role === 'owner') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Transfer ownership first — the owner cannot leave',
      });
    }

    const { removedDeviceIds } = await memberModel.removeMember(params.workspaceId, params.userId);
    await recordAudit(tx, {
      action: 'member.left',
      ipAddress: params.ipAddress,
      metadata: { removedDeviceIds },
      resourceId: params.userId,
      resourceType: 'workspace_member',
      userId: params.userId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.userId,
      aggregateType: 'workspace_member',
      eventType: 'workspace.member.left',
      payload: { userId: params.userId },
      workspaceId: params.workspaceId,
    });
    return { left: true as const };
  });
};

export const transferWorkspaceOwnership = async (
  db: LobeChatDatabase,
  params: {
    actorUserId: string;
    ipAddress?: string;
    newOwnerUserId: string;
    workspaceId: string;
  },
) => {
  if (params.newOwnerUserId === params.actorUserId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already own this workspace' });
  }
  const target = await new WorkspaceMemberModel(db, params.actorUserId).getMember(
    params.workspaceId,
    params.newOwnerUserId,
  );
  if (!target || target.role === 'owner') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The new owner must be an active non-owner member',
    });
  }

  try {
    await db.transaction(async (tx) => {
      const result = await new WorkspaceModel(tx, params.actorUserId).transferPrimaryOwnership(
        params.workspaceId,
        params.newOwnerUserId,
      );
      await recordAudit(tx, {
        action: 'ownership.transferred',
        ipAddress: params.ipAddress,
        metadata: {
          newOwnerUserId: result.newPrimaryOwnerUserId,
          previousOwnerUserId: result.previousPrimaryOwnerUserId,
        },
        resourceId: params.workspaceId,
        resourceType: 'workspace',
        userId: params.actorUserId,
        workspaceId: params.workspaceId,
      });
      await emitWorkspaceEvent(tx, {
        aggregateId: params.workspaceId,
        aggregateType: 'workspace',
        eventType: 'workspace.ownership.transferred',
        payload: {
          newOwnerUserId: result.newPrimaryOwnerUserId,
          previousOwnerUserId: result.previousPrimaryOwnerUserId,
        },
        workspaceId: params.workspaceId,
      });
      return result;
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Only the workspace owner')) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the workspace owner can transfer ownership',
      });
    }
    if (message.includes('must already be')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message });
    }
    throw new TRPCError({
      cause: error,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to transfer ownership',
    });
  }

  return { transferred: true as const };
};
