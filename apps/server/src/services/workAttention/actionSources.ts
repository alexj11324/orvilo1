import { randomUUID } from 'node:crypto';

import type {
  ActionRef,
  ActionSourceKind,
  DecisionReceipt,
  DecisionVerb,
  VersionedDecision,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq, gt, isNull, or } from 'drizzle-orm';

import {
  type AgentInterventionSourceAction,
  resolveAgentInterventionBySource,
} from '@/business/server/agent-run/agentInterventionReview';
import {
  cancelOwnershipTransfer,
  respondOwnershipTransfer,
} from '@/business/server/membershipLifecycle/ownershipTransfer';
import type { NotificationModel } from '@/database/models/notification';
import { ResourceTransferRequestModel } from '@/database/models/resourceTransferRequest';
import { actionApprovals } from '@/database/schemas/actionApproval';
import {
  type AgentInterventionItem,
  agentInterventions,
} from '@/database/schemas/agentIntervention';
import { tasks } from '@/database/schemas/task';
import {
  type WorkspaceOwnershipTransferItem,
  workspaceOwnershipTransfers,
} from '@/database/schemas/workspace';
import type { OrviloDatabase } from '@/database/type';
import { ActionApprovalService } from '@/server/services/agentDelegation/actionApprovals';
import { TaskInputService } from '@/server/services/agentDelegation/taskInputs';
import { executeAcceptedTransfer } from '@/server/services/resourceTransferRequest';

const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const PENDING_SOURCE_LIMIT = 50;

export interface PendingSourceCard {
  actionKind: ActionSourceKind;
  content: string;
  requestId: string;
  resourceId?: string;
  resourceType?: string;
  title: string;
}

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

const resolutionRequestId = (idempotencyKey: string) =>
  UUID_PATTERN.test(idempotencyKey) ? idempotencyKey : randomUUID();

const asAnswerResult = (
  payload: Record<string, unknown> | undefined,
): Record<string, string | string[]> | null => {
  if (!payload) return null;
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      result[key] = value;
      continue;
    }
    return null;
  }
  return Object.keys(result).length > 0 ? result : null;
};

const mapInterventionAction = (
  command: VersionedDecision,
): AgentInterventionSourceAction | null => {
  if (command.decision === 'approve') {
    return { scope: 'once', type: 'approve_tool' };
  }
  if (command.decision === 'decline' || command.decision === 'reject') {
    return { type: 'reject_continue' };
  }
  if (command.decision === 'cancel') {
    return { scope: 'operation', type: 'stop' };
  }
  if (command.decision === 'submit_input') {
    const result = asAnswerResult(command.inputPayload);
    if (!result) return null;
    return { result, type: 'submit_answers' };
  }
  return null;
};

/**
 * Inbox adapters over existing approval / input / transfer / intervention
 * services. There is no generic execute(notification.payload) endpoint.
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
      )
      .limit(PENDING_SOURCE_LIMIT);
  };

  /**
   * Live source requests the actor can still decide, even when the
   * notification projection is missing or an old client archived the card.
   */
  listPendingForActor = async (): Promise<PendingSourceCard[]> => {
    const cards: PendingSourceCard[] = [];
    const now = new Date();

    for (const row of await this.listPendingApprovals()) {
      cards.push({
        actionKind: row.actionType === 'task_review' ? 'task_review' : 'acp_permission',
        content:
          typeof row.actionSummary === 'object' &&
          row.actionSummary &&
          'summary' in row.actionSummary
            ? String((row.actionSummary as { summary?: unknown }).summary ?? 'Approval required')
            : 'Approval required',
        requestId: row.id,
        resourceId: row.targetId ?? undefined,
        resourceType: row.targetType ?? undefined,
        title: 'Approval required',
      });
    }

    if (this.workspaceId) {
      const transfers = await new ResourceTransferRequestModel(
        this.db,
        this.workspaceId,
      ).listPendingForUser(this.userId);
      for (const row of transfers) {
        cards.push({
          actionKind: 'resource_transfer',
          content:
            row.initiatorId === this.userId
              ? 'Waiting for the recipient. You can withdraw this transfer.'
              : 'Resource transfer request',
          requestId: row.id,
          resourceId: row.resourceId,
          resourceType: row.resourceType,
          title:
            row.initiatorId === this.userId
              ? 'Outgoing resource transfer'
              : 'Resource transfer request',
        });
      }

      const ownershipRows = await this.db
        .select()
        .from(workspaceOwnershipTransfers)
        .where(
          and(
            eq(workspaceOwnershipTransfers.workspaceId, this.workspaceId),
            eq(workspaceOwnershipTransfers.status, 'pending'),
            gt(workspaceOwnershipTransfers.expiresAt, now),
            or(
              eq(workspaceOwnershipTransfers.fromUserId, this.userId),
              eq(workspaceOwnershipTransfers.toUserId, this.userId),
            ),
          ),
        )
        .limit(PENDING_SOURCE_LIMIT);
      for (const row of ownershipRows) {
        cards.push({
          actionKind: 'workspace_ownership_transfer',
          content:
            row.fromUserId === this.userId
              ? 'Waiting for the invited member. You can cancel this transfer.'
              : 'Workspace ownership transfer request',
          requestId: row.id,
          resourceId: row.workspaceId,
          resourceType: 'workspace',
          title:
            row.fromUserId === this.userId
              ? 'Outgoing ownership transfer'
              : 'Workspace ownership transfer request',
        });
      }
    }

    const interventionRows = await this.db
      .select()
      .from(agentInterventions)
      .where(
        and(
          eq(agentInterventions.userId, this.userId),
          this.workspaceId
            ? eq(agentInterventions.workspaceId, this.workspaceId)
            : isNull(agentInterventions.workspaceId),
          eq(agentInterventions.status, 'pending'),
          gt(agentInterventions.deadline, now),
        ),
      )
      .limit(PENDING_SOURCE_LIMIT);
    for (const row of interventionRows) {
      cards.push({
        actionKind: 'acp_intervention',
        content:
          row.reviewContext.summary ?? row.sanitizedRequest.prompt ?? 'Agent needs your review',
        requestId: row.id,
        title: row.reviewContext.title || 'Agent needs your review',
      });
    }

    return cards;
  };

  ensurePendingSourceCards = async (notificationModel: NotificationModel) => {
    await notificationModel.ensureActionCards(await this.listPendingForActor());
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
    if (ref.kind === 'acp_intervention') {
      const [row] = await this.db
        .select()
        .from(agentInterventions)
        .where(eq(agentInterventions.id, ref.requestId))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Intervention not found' });
      }
      const rowWorkspace = row.workspaceId ?? undefined;
      if (rowWorkspace !== this.workspaceId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Intervention not found' });
      }
      if (row.userId !== this.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not the recorded owner' });
      }
      return row;
    }
    if (ref.kind === 'acp_input') {
      const [row] = await this.db.select().from(tasks).where(eq(tasks.id, ref.requestId)).limit(1);
      if (!row || (row.workspaceId ?? undefined) !== this.workspaceId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      if (
        row.assigneeUserId !== this.userId &&
        row.reviewerUserId !== this.userId &&
        row.createdByUserId !== this.userId &&
        !this.callerIsWorkspaceAdmin
      ) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not allowed to submit input' });
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

    if (actionRef.kind === 'acp_intervention') {
      const row = (await this.getAuthorized(actionRef)) as AgentInterventionItem;
      if (row.status !== 'pending') {
        if (row.status === 'timed_out') {
          return { executionStarted: false, sourceState: row.status, status: 'expired' };
        }
        return { executionStarted: false, sourceState: row.status, status: 'already_decided' };
      }
      if (row.deadline.getTime() <= Date.now()) {
        return { executionStarted: false, sourceState: 'timed_out', status: 'expired' };
      }
      if (
        typeof command.expectedSourceRevision === 'number' &&
        command.expectedSourceRevision !== row.version
      ) {
        return { executionStarted: false, sourceState: row.status, status: 'stale' };
      }
      if (
        typeof command.expectedSourceRevision === 'string' &&
        command.expectedSourceRevision !== row.requestRevisionHash
      ) {
        return { executionStarted: false, sourceState: row.status, status: 'stale' };
      }
      if (!row.toolMessageId) {
        return { executionStarted: false, sourceState: row.status, status: 'outcome_unknown' };
      }

      const action = mapInterventionAction(command);
      if (!action) {
        return { executionStarted: false, sourceState: row.status, status: 'outcome_unknown' };
      }

      const resolution = await resolveAgentInterventionBySource({
        action,
        actorUserId: this.userId,
        batchId: row.batchId,
        operationId: row.operationId,
        resolutionRequestId: resolutionRequestId(command.idempotencyKey),
        targets: [{ toolCallId: row.toolCallId, toolMessageId: row.toolMessageId }],
        workspaceId: this.workspaceId,
      });

      if (!resolution.handled) {
        // OSS has no durable generic store; Cloud claims here. Inbox must not
        // invent a second status machine or dispatch runtime itself.
        return { executionStarted: false, sourceState: 'unavailable', status: 'outcome_unknown' };
      }
      if (resolution.state === 'already_resolved') {
        return {
          executionStarted: false,
          sourceState: resolution.status,
          status: 'already_decided',
        };
      }
      return { executionStarted: false, sourceState: resolution.state, status: 'outcome_unknown' };
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
