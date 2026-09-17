import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';

import type { LobeChatDatabase } from '@/database/type';

import { actionApprovals, insertOutboxEvent, newEventId } from './contractTables';
import type { ApprovalDecision } from './types';

export interface DecideApprovalParams {
  approvalId: string;
  baseSha?: string;
  baseVersion?: number;
  decision: ApprovalDecision;
}

const APPROVAL_STALE = 'approval no longer valid';

/**
 * Decision endpoint for recorded action approvals. The approver binding and
 * the recorded base (task version / external SHA) are part of the grant: a
 * world that moved under the request invalidates it instead of letting a stale
 * approval land on new state.
 */
export class ActionApprovalService {
  private readonly db: LobeChatDatabase;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  /**
   * `callerIsWorkspaceAdmin` comes from the caller's live membership role —
   * the recorded approver or any current workspace admin may decide.
   */
  decide = async (params: DecideApprovalParams & { callerIsWorkspaceAdmin: boolean }) => {
    const now = new Date();
    const { callerIsWorkspaceAdmin, ...input } = params;

    const decided = await this.db.transaction(async (tx) => {
      const [approval] = await tx
        .select()
        .from(actionApprovals)
        .where(eq(actionApprovals.id, input.approvalId))
        .for('update')
        .limit(1);

      if (!approval || approval.workspaceId !== this.workspaceId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Approval not found' });
      }

      if (approval.approverUserId !== this.userId && !callerIsWorkspaceAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the recorded approver or a workspace admin may decide',
        });
      }

      if (approval.status !== 'pending') {
        throw new TRPCError({ code: 'CONFLICT', message: APPROVAL_STALE });
      }
      if (approval.expiresAt && approval.expiresAt.getTime() <= now.getTime()) {
        await tx
          .update(actionApprovals)
          .set({ status: 'expired' })
          .where(eq(actionApprovals.id, approval.id));
        throw new TRPCError({ code: 'CONFLICT', message: APPROVAL_STALE });
      }

      // The world the approval was requested against must be the world the
      // decision lands on: a drifted base version or external SHA revokes the
      // request rather than approving unseen state.
      if (
        (input.baseVersion !== undefined &&
          approval.baseVersion !== null &&
          input.baseVersion !== approval.baseVersion) ||
        (input.baseSha !== undefined &&
          approval.baseSha !== null &&
          input.baseSha !== approval.baseSha)
      ) {
        throw new TRPCError({ code: 'CONFLICT', message: APPROVAL_STALE });
      }

      const [updated] = await tx
        .update(actionApprovals)
        .set({ decidedAt: now, status: input.decision })
        .where(and(eq(actionApprovals.id, approval.id), eq(actionApprovals.status, 'pending')))
        .returning();
      if (!updated) {
        // A concurrent decider won the CAS — surface it as the same stale result.
        throw new TRPCError({ code: 'CONFLICT', message: APPROVAL_STALE });
      }

      // A target-less approval has no room to project into — the decision is
      // still durable on the row itself.
      if (approval.targetId && approval.targetType) {
        await insertOutboxEvent(tx, {
          aggregateId: approval.targetId,
          aggregateType: approval.targetType,
          eventId: newEventId(),
          eventType: 'collaboration.activity',
          payload: {
            action: `approval.${input.decision}`,
            actor: { id: this.userId, kind: 'human' },
            approvalId: approval.id,
            phase: 'committed',
            target: {
              anchor: 'status',
              entityId: approval.targetId,
              entityType: approval.targetType === 'project' ? 'project' : 'task',
            },
            workspaceId: approval.workspaceId,
          },
          workspaceId: approval.workspaceId,
        });
      }

      return updated;
    });

    return decided;
  };

  /**
   * One-shot consumption of an approved grant: the first consumer flips
   * `consumedAt` and wins; later callers get null and must re-request. The
   * approval is intentionally not re-decided — it is spent.
   */
  consume = async (approvalId: string) => {
    const [row] = await this.db
      .update(actionApprovals)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(actionApprovals.id, approvalId),
          eq(actionApprovals.status, 'approved'),
          isNull(actionApprovals.consumedAt),
        ),
      )
      .returning();
    return row ?? null;
  };
}
