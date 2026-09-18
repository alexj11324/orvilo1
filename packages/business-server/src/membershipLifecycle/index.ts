import { canWorkspaceRoleBeTaskAssignee } from '@orvilo/const/rbac';
import type { OrviloDatabase } from '@orvilo/database';
import type { WorkspaceMemberItem } from '@orvilo/database/schemas';
import { TRPCError } from '@trpc/server';

import { WorkspaceMemberModel } from '@/database/models/workspaceMember';

import { emitWorkspaceEvent, recordAudit } from './audit';
import {
  bumpAuthzVersion,
  countActiveDelegations,
  countMemberBoundDevices,
  countMemberWorkload,
  countOpenTasksAssignedTo,
  countOpenTasksReviewedBy,
  findMembershipRow,
  listMembersWithProfiles,
  listOpenAssignedTaskTitles,
  lockMembershipForUpdate,
  lockWorkspaceForUpdate,
  reassignOpenAssignedTasks,
} from './queries';
import { canGrantWorkspaceRole, canManageMember, type WorkspaceRoleName } from './roles';

export interface MemberSummary extends WorkspaceMemberItem {
  /** Open tasks the member currently owns — drives the roster's work column. */
  openAssignedCount: number;
  /** Open tasks awaiting the member's review. */
  openReviewingCount: number;
  /** Project memberships the member holds inside this workspace. */
  projectCount: number;
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
  db: OrviloDatabase,
  params: { includeDeleted: boolean; viewerIsAdmin: boolean; workspaceId: string },
): Promise<MemberSummary[]> => {
  const [rows, workload] = await Promise.all([
    listMembersWithProfiles(db, params.workspaceId, params.includeDeleted),
    countMemberWorkload(db, params.workspaceId),
  ]);
  return rows.map(({ member, user }) => ({
    ...member,
    openAssignedCount: workload.get(member.userId)?.openAssignedCount ?? 0,
    openReviewingCount: workload.get(member.userId)?.openReviewingCount ?? 0,
    projectCount: workload.get(member.userId)?.projectCount ?? 0,
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
  db: OrviloDatabase,
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
      action: 'member.role_updated',
      ipAddress: params.ipAddress,
      metadata: { fromRole: target.role, toRole: params.role },
      resourceId: params.targetUserId,
      resourceType: 'workspace_member',
      userId: params.actorUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.workspaceId,
      aggregateType: 'workspace',
      eventType: 'workspace.member.role_changed',
      payload: { role: params.role, userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });
    return { changed: true as const, role: params.role };
  });
};

const setMemberSuspended = async (
  db: OrviloDatabase,
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
      aggregateId: params.workspaceId,
      aggregateType: 'workspace',
      eventType: `workspace.${action}`,
      payload: { userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });
    return { changed: true as const, suspended: params.suspended };
  });
};

export const suspendMember = (
  db: OrviloDatabase,
  params: Omit<Parameters<typeof setMemberSuspended>[1], 'suspended'>,
) => setMemberSuspended(db, { ...params, suspended: true });

export const resumeMember = (
  db: OrviloDatabase,
  params: Omit<Parameters<typeof setMemberSuspended>[1], 'suspended'>,
) => setMemberSuspended(db, { ...params, suspended: false });

export const previewMemberRemoval = async (
  db: OrviloDatabase,
  params: { targetUserId: string; workspaceId: string },
): Promise<MemberRemovalPreview> => {
  // Suspended members are removable — and the preview is precisely how an
  // admin weighs that removal — so read the row regardless of suspension.
  const member = await findMembershipRow(db, params.workspaceId, params.targetUserId);
  if (!member || member.deletedAt) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Not an active member' });
  }

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
  db: OrviloDatabase,
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
      // Membership alone is not enough: a viewer passes `getMember` but can
      // never own a task, so reassigning to them would silently orphan the
      // departing member's open work.
      if (!canWorkspaceRoleBeTaskAssignee(reassignTarget.role)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'reassignToUserId must hold a task-assignable workspace role',
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
      aggregateId: params.workspaceId,
      aggregateType: 'workspace',
      eventType: 'workspace.member.removed',
      payload: { userId: params.targetUserId },
      workspaceId: params.workspaceId,
    });

    return { reassignedTaskCount, removedDeviceIds };
  });
};

export const leaveWorkspace = async (
  db: OrviloDatabase,
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
      aggregateId: params.workspaceId,
      aggregateType: 'workspace',
      eventType: 'workspace.member.left',
      payload: { userId: params.userId },
      workspaceId: params.workspaceId,
    });
    return { left: true as const };
  });
};
