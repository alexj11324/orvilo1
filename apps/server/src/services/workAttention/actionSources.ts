import type { ActionRef, DecisionReceipt, DecisionVerb, VersionedDecision } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import {
  cancelOwnershipTransfer,
  respondOwnershipTransfer,
} from '@/business/server/membershipLifecycle/ownershipTransfer';
import { ResourceTransferRequestModel } from '@/database/models/resourceTransferRequest';
import { actionApprovals } from '@/database/schemas/actionApproval';
import {
  type WorkspaceOwnershipTransferItem,
  workspaceOwnershipTransfers,
} from '@/database/schemas/workspace';
import type { OrviloDatabase } from '@/database/type';
import { ActionApprovalService } from '@/server/services/agentDelegation/actionApprovals';
import { TaskInputService } from '@/server/services/agentDelegation/taskInputs';
import { executeAcceptedTransfer } from '@/server/services/resourceTransferRequest';

const verbToApproval = (decision: DecisionVerb): 'approved' | 'rejected' => {
  if (decision === 'approve') return 'approved';
  return 'rejected';
};

const mapApprovalReceipt = (status: string): DecisionReceipt => {
  if (status === 'approved') {
    return { executionStarted: false, sourceState: status, status: 'source_accepted' };
  }
  if (status === 'rejected') {
    return { executionStarted: false, sourceState: status, status: 'source_rejected' };
  }
  if (status === 'expired') {
    return { executionStarted: false, sourceState: status, status: 'expired' };
  }
  if (status === 'consumed') {
    return { executionStarted: true, sourceState: status, status: 'source_confirmed' };
  }
  return { executionStarted: false, sourceState: status, status: 'already_decided' };
};

/**
 * Inbox adapters over existing approval / input / transfer services.
 * There is no generic execute(notification.payload) endpoint.
 */
export class ActionSourceRegistry {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId: string | undefined,
    private readonly callerIsWorkspaceAdmin: boolean,
  ) {}

  listPendingApprovals = async () => {
    if (!this.workspaceId) return [];
    return this.db
      .select()
      .from(actionApprovals)
      .where(
        and(
          eq(actionApprovals.workspaceId, this.workspaceId),
          eq(actionApprovals.status, 'pending'),
          eq(actionApprovals.approverUserId, this.userId),
        ),
      );
  };

  getAuthorized = async (ref: ActionRef) => {
    if (ref.kind === 'acp_permission' || ref.kind === 'task_review') {
      const [row] = await this.db
        .select()
        .from(actionApprovals)
        .where(eq(actionApprovals.id, ref.requestId))
        .limit(1);
      if (!row || row.workspaceId !== this.workspaceId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Approval not found' });
      }
      if (row.approverUserId !== this.userId && !this.callerIsWorkspaceAdmin) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not the recorded approver' });
      }
      return row;
    }
    if (ref.kind === 'resource_transfer') {
      if (!this.workspaceId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
      const model = new ResourceTransferRequestModel(this.db, this.workspaceId);
      const row = await model.findById(ref.requestId);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer request not found' });
      if (row.recipientId !== this.userId && row.initiatorId !== this.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a party to this transfer' });
      }
      return row;
    }
    if (ref.kind === 'workspace_ownership_transfer') {
      if (!this.workspaceId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
      const [row] = await this.db
        .select()
        .from(workspaceOwnershipTransfers)
        .where(eq(workspaceOwnershipTransfers.id, ref.requestId))
        .limit(1);
      if (!row || row.workspaceId !== this.workspaceId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ownership transfer not found' });
      }
      if (row.fromUserId !== this.userId && row.toUserId !== this.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a party to this transfer' });
      }
      return row;
    }
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Unknown action source' });
  };

  decide = async (command: VersionedDecision): Promise<DecisionReceipt> => {
    const { actionRef } = command;
    await this.getAuthorized(actionRef);

    if (actionRef.kind === 'acp_permission' || actionRef.kind === 'task_review') {
      const approvals = new ActionApprovalService(this.db, this.userId, this.workspaceId);
      try {
        const decided = await approvals.decide({
          approvalId: actionRef.requestId,
          baseSha:
            typeof command.expectedSourceRevision === 'string'
              ? command.expectedSourceRevision
              : undefined,
          baseVersion:
            typeof command.expectedSourceRevision === 'number'
              ? command.expectedSourceRevision
              : (command.expectedExecutionGeneration ?? undefined),
          callerIsWorkspaceAdmin: this.callerIsWorkspaceAdmin,
          decision: verbToApproval(command.decision),
        });
        if (command.paramsHash && decided.paramsHash && command.paramsHash !== decided.paramsHash) {
          return { executionStarted: false, sourceState: decided.status, status: 'stale' };
        }
        return mapApprovalReceipt(decided.status);
      } catch (error) {
        if (error instanceof TRPCError && error.code === 'CONFLICT') {
          return { executionStarted: false, status: 'stale' };
        }
        throw error;
      }
    }

    if (actionRef.kind === 'resource_transfer') {
      if (!this.workspaceId)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspace required' });
      const model = new ResourceTransferRequestModel(this.db, this.workspaceId);
      const request = await model.findById(actionRef.requestId);
      if (!request)
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transfer request not found' });
      if (request.status !== 'pending') {
        return { executionStarted: false, sourceState: request.status, status: 'already_decided' };
      }
      if (command.decision === 'approve') {
        await executeAcceptedTransfer({
          db: this.db,
          recipientId: this.userId,
          request,
          workspaceId: this.workspaceId,
        });
        return { executionStarted: false, sourceState: 'accepted', status: 'source_accepted' };
      }
      if (command.decision === 'decline' || command.decision === 'reject') {
        await model.decline(actionRef.requestId, this.userId);
        return { executionStarted: false, sourceState: 'declined', status: 'source_rejected' };
      }
      if (command.decision === 'cancel') {
        await model.cancel(actionRef.requestId, this.userId);
        return { executionStarted: false, sourceState: 'cancelled', status: 'source_rejected' };
      }
    }

    if (actionRef.kind === 'workspace_ownership_transfer') {
      if (!this.workspaceId)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspace required' });
      const row = (await this.getAuthorized(actionRef)) as WorkspaceOwnershipTransferItem;
      if (row.status !== 'pending') {
        if (row.status === 'expired') {
          return { executionStarted: false, sourceState: row.status, status: 'expired' };
        }
        return { executionStarted: false, sourceState: row.status, status: 'already_decided' };
      }
      if (command.expectedSourceRevision && command.expectedSourceRevision !== row.id) {
        return { executionStarted: false, sourceState: row.status, status: 'stale' };
      }

      if (command.decision === 'cancel') {
        if (row.fromUserId !== this.userId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only the owner who initiated the transfer can cancel it',
          });
        }
        await cancelOwnershipTransfer(this.db, {
          userId: this.userId,
          workspaceId: this.workspaceId,
        });
        return { executionStarted: false, sourceState: 'cancelled', status: 'source_rejected' };
      }

      if (
        command.decision === 'approve' ||
        command.decision === 'decline' ||
        command.decision === 'reject'
      ) {
        if (row.toUserId !== this.userId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only the invited member can respond to this transfer',
          });
        }
        try {
          const outcome = await respondOwnershipTransfer(this.db, {
            accept: command.decision === 'approve',
            userId: this.userId,
            workspaceId: this.workspaceId,
          });
          if (outcome.accepted) {
            return { executionStarted: false, sourceState: 'accepted', status: 'source_accepted' };
          }
          return { executionStarted: false, sourceState: 'declined', status: 'source_rejected' };
        } catch (error) {
          if (error instanceof TRPCError && error.code === 'BAD_REQUEST') {
            return { executionStarted: false, sourceState: 'expired', status: 'expired' };
          }
          if (error instanceof TRPCError && error.code === 'NOT_FOUND') {
            return { executionStarted: false, status: 'already_decided' };
          }
          throw error;
        }
      }
    }

    if (actionRef.kind === 'acp_input') {
      const inputs = new TaskInputService(this.db, this.userId, this.workspaceId);
      await inputs.submit({
        idempotencyKey: command.idempotencyKey,
        intentType: 'decision',
        payload: command.inputPayload ?? {},
        taskId: actionRef.requestId,
      });
      return { executionStarted: false, sourceState: 'pending', status: 'source_accepted' };
    }

    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported action kind' });
  };
}
