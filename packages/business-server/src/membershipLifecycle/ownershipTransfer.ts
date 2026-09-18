import { OWNERSHIP_TRANSFER_EXPIRY_DAYS } from '@orvilo/const';
import type { OrviloDatabase } from '@orvilo/database';
import type { WorkspaceOwnershipTransferItem } from '@orvilo/database/schemas';
import { TRPCError } from '@trpc/server';

import { WorkspaceModel } from '@/database/models/workspace';
import { WorkspaceMemberModel } from '@/database/models/workspaceMember';

import { emitWorkspaceEvent, recordAudit } from './audit';
import {
  decideOwnershipTransfer,
  findPendingOwnershipTransfer,
  findUserProfiles,
  insertOwnershipTransfer,
  lockPendingOwnershipTransferForUpdate,
  lockWorkspaceForUpdate,
} from './queries';

const TRANSFER_TTL_MS = OWNERSHIP_TRANSFER_EXPIRY_DAYS * 86_400_000;

/** Map a `transferPrimaryOwnership` failure onto the right wire error. */
const rethrowTransferError = (error: unknown): never => {
  if (error instanceof TRPCError) throw error;
  const message = error instanceof Error ? error.message : '';
  if (message.includes('Only the workspace owner') || message.includes('must already be')) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'The pending transfer is no longer valid — cancel and start a new one',
    });
  }
  throw error;
};

/**
 * Owner initiates the hand-off: validates the recipient and persists a pending
 * request. Nothing changes until the recipient accepts — `primaryOwnerId` and
 * both role rows stay put.
 */
export const requestOwnershipTransfer = async (
  db: OrviloDatabase,
  params: { ipAddress?: string; ownerUserId: string; targetUserId: string; workspaceId: string },
) => {
  if (params.targetUserId === params.ownerUserId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'You already own this workspace' });
  }
  return db.transaction(async (tx) => {
    const workspace = await lockWorkspaceForUpdate(tx, params.workspaceId);
    if (!workspace || workspace.primaryOwnerId !== params.ownerUserId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the current owner can transfer ownership',
      });
    }
    const memberModel = new WorkspaceMemberModel(tx, params.ownerUserId);
    const target = await memberModel.getMember(params.workspaceId, params.targetUserId);
    if (!target) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The new owner must be an active member of this workspace',
      });
    }
    // `transferPrimaryOwnership` only accepts an admin (or legacy co-owner)
    // target — reject at request time so a doomed request never sits pending.
    if (target.role !== 'admin' && target.role !== 'owner') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The new owner must hold the admin role — promote them first',
      });
    }
    if (await findPendingOwnershipTransfer(tx, params.workspaceId)) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'A transfer is already awaiting a decision',
      });
    }

    const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
    const transfer = await insertOwnershipTransfer(tx, {
      expiresAt,
      fromUserId: params.ownerUserId,
      toUserId: params.targetUserId,
      workspaceId: params.workspaceId,
    });

    await recordAudit(tx, {
      action: 'workspace.ownership_transfer_requested',
      ipAddress: params.ipAddress,
      metadata: { expiresAt, toUserId: params.targetUserId, transferId: transfer.id },
      resourceId: transfer.id,
      resourceType: 'workspace_ownership_transfer',
      userId: params.ownerUserId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.workspaceId,
      aggregateType: 'workspace',
      eventType: 'workspace.ownership_transfer.requested',
      payload: { toUserId: params.targetUserId, transferId: transfer.id },
      workspaceId: params.workspaceId,
    });
    return { requested: true as const, transfer };
  });
};

/**
 * Recipient decides. Accepting runs the atomic owner swap and consumes the
 * request in the same transaction; declining just records the answer.
 */
export const respondOwnershipTransfer = async (
  db: OrviloDatabase,
  params: { accept: boolean; ipAddress?: string; userId: string; workspaceId: string },
) => {
  return db.transaction(async (tx) => {
    await lockWorkspaceForUpdate(tx, params.workspaceId);
    const transfer = await lockPendingOwnershipTransferForUpdate(tx, params.workspaceId);
    if (!transfer) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No pending ownership transfer' });
    }
    if (transfer.toUserId !== params.userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the invited member can respond to this transfer',
      });
    }
    if (transfer.expiresAt.getTime() <= Date.now()) {
      await decideOwnershipTransfer(tx, transfer.id, 'expired');
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This transfer request has expired' });
    }

    if (params.accept) {
      try {
        await new WorkspaceModel(tx, transfer.fromUserId).transferPrimaryOwnership(
          params.workspaceId,
          transfer.toUserId,
        );
      } catch (error) {
        rethrowTransferError(error);
      }
    }
    await decideOwnershipTransfer(tx, transfer.id, params.accept ? 'accepted' : 'declined');
    await recordAudit(tx, {
      action: params.accept
        ? 'workspace.ownership_transfer_accepted'
        : 'workspace.ownership_transfer_declined',
      ipAddress: params.ipAddress,
      metadata: { transferId: transfer.id },
      resourceId: transfer.id,
      resourceType: 'workspace_ownership_transfer',
      userId: params.userId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.workspaceId,
      aggregateType: 'workspace',
      eventType: params.accept
        ? 'workspace.ownership.transferred'
        : 'workspace.ownership_transfer.declined',
      payload: {
        newOwnerUserId: params.accept ? transfer.toUserId : null,
        previousOwnerUserId: transfer.fromUserId,
        transferId: transfer.id,
      },
      workspaceId: params.workspaceId,
    });
    return { accepted: params.accept };
  });
};

/** Owner retracts a still-pending request. */
export const cancelOwnershipTransfer = async (
  db: OrviloDatabase,
  params: { ipAddress?: string; userId: string; workspaceId: string },
) => {
  return db.transaction(async (tx) => {
    await lockWorkspaceForUpdate(tx, params.workspaceId);
    const transfer = await lockPendingOwnershipTransferForUpdate(tx, params.workspaceId);
    if (!transfer) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'No pending ownership transfer' });
    }
    if (transfer.fromUserId !== params.userId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the owner who initiated the transfer can cancel it',
      });
    }
    await decideOwnershipTransfer(tx, transfer.id, 'cancelled');
    await recordAudit(tx, {
      action: 'workspace.ownership_transfer_cancelled',
      ipAddress: params.ipAddress,
      metadata: { toUserId: transfer.toUserId, transferId: transfer.id },
      resourceId: transfer.id,
      resourceType: 'workspace_ownership_transfer',
      userId: params.userId,
      workspaceId: params.workspaceId,
    });
    await emitWorkspaceEvent(tx, {
      aggregateId: params.workspaceId,
      aggregateType: 'workspace',
      eventType: 'workspace.ownership_transfer.cancelled',
      payload: { transferId: transfer.id },
      workspaceId: params.workspaceId,
    });
    return { cancelled: true as const };
  });
};

export interface OwnershipTransferState {
  fromUser: { avatar: string | null; fullName: string | null; username: string | null } | null;
  toUser: { avatar: string | null; fullName: string | null; username: string | null } | null;
  transfer: WorkspaceOwnershipTransferItem;
}

/**
 * The workspace's pending transfer as seen by one of its parties — the
 * initiator or the invited member. Other members get `null`: an in-flight
 * hand-off is nobody else's business.
 */
export const getOwnershipTransferState = async (
  db: OrviloDatabase,
  params: { userId: string; workspaceId: string },
): Promise<OwnershipTransferState | null> => {
  const transfer = await findPendingOwnershipTransfer(db, params.workspaceId);
  if (!transfer || (transfer.fromUserId !== params.userId && transfer.toUserId !== params.userId)) {
    return null;
  }
  const profiles = await findUserProfiles(db, [transfer.fromUserId, transfer.toUserId]);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return {
    fromUser: byId.get(transfer.fromUserId) ?? null,
    toUser: byId.get(transfer.toUserId) ?? null,
    transfer,
  };
};
