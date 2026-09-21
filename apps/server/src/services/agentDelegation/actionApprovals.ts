import type { ServerActivityEvent } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';

import type { ActionApprovalItem } from '@/database/schemas/actionApproval';
import type { OrviloDatabase, Transaction } from '@/database/type';

import { actionApprovals, insertOutboxEvent, newEventId, tasks } from './contractTables';
import type { ApprovalDecision } from './types';

export interface DecideApprovalParams {
  approvalId: string;
  baseSha?: string;
  baseVersion?: number;
  decision: ApprovalDecision;
}

/**
 * Discriminated outcome of {@link ActionApprovalService.consumeForDispatch}.
 * `consumed` — this dispatch won the spend; `adopted` — the same dispatch
 * already owned it (a retry after a transient failure); everything else is a
 * refusal that left the grant untouched.
 */
export type ConsumeForDispatchOutcome =
  | { approval?: undefined; kind: 'missing' }
  | { approval: ActionApprovalItem; kind: 'adopted' | 'consumed' }
  | {
      approval: ActionApprovalItem;
      kind: 'expired' | 'no_approver' | 'revision_mismatch' | 'scope_mismatch' | 'unavailable';
    };

const APPROVAL_STALE = 'approval no longer valid';

/**
 * How long a decision event stays a live pulse in rooms — the ephemeral
 * animation deadline on `ServerActivityEvent.expiresAt`. History survives
 * past it; a decision the room missed live is still replayed by snapshot.
 */
const ACTIVITY_EVENT_LIVE_MS = 30_000;

/** Resolve a task's project for the activity payload; projectless tasks carry ''. */
const taskProjectId = async (tx: Transaction, taskId: string): Promise<string> => {
  const [row] = await tx
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return row?.projectId ?? '';
};

/**
 * Decision endpoint for recorded action approvals. The approver binding and
 * the recorded base (task version / external SHA) are part of the grant: a
 * world that moved under the request invalidates it instead of letting a stale
 * approval land on new state.
 */
export class ActionApprovalService {
  private readonly db: OrviloDatabase;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
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

    const outcome = await this.db.transaction(async (tx) => {
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
        // Lapse the row and let the transaction COMMIT — throwing here would
        // roll the 'expired' write back and leave a dead approval pending
        // forever. The CONFLICT is thrown after the commit, below.
        await tx
          .update(actionApprovals)
          .set({ status: 'expired' })
          .where(eq(actionApprovals.id, approval.id));
        return { expired: true as const };
      }

      // The world the approval was requested against must be the world the
      // decision lands on. A recorded base must be echoed back exactly —
      // omitting it would bypass the only drift check, so a missing echo is
      // treated the same as a mismatched one. An unanchored request (null
      // base) carries nothing to verify.
      if (
        (approval.baseVersion !== null && input.baseVersion !== approval.baseVersion) ||
        (approval.baseSha !== null && input.baseSha !== approval.baseSha)
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
      // still durable on the row itself. Non-entity targets emit nothing:
      // `SemanticTarget.entityType` only spans 'project' | 'task'.
      if (
        approval.targetId &&
        (approval.targetType === 'project' || approval.targetType === 'task')
      ) {
        // One id for the outbox row AND the activity event inside it — the
        // projector hands the payload through verbatim and consumers dedup on
        // eventId, so the two must never disagree.
        const eventId = newEventId();
        const occurredAt = now.toISOString();
        const activity: ServerActivityEvent = {
          action: `approval.${input.decision}`,
          actor: { id: this.userId, kind: 'human' },
          entityVersion: approval.baseVersion ?? 0,
          eventId,
          expiresAt: new Date(now.getTime() + ACTIVITY_EVENT_LIVE_MS).toISOString(),
          occurredAt,
          phase: 'committed',
          projectId:
            approval.targetType === 'project'
              ? approval.targetId
              : await taskProjectId(tx, approval.targetId),
          target: {
            anchor: 'status',
            entityId: approval.targetId,
            entityType: approval.targetType,
          },
          workspaceId: approval.workspaceId,
        };
        await insertOutboxEvent(tx, {
          aggregateId: approval.targetId,
          aggregateType: approval.targetType,
          eventId,
          eventType: 'collaboration.activity',
          payload: { ...activity, approvalId: approval.id },
          workspaceId: approval.workspaceId,
        });
      }

      return { decided: updated };
    });

    // The lapse committed above; only now is it safe to surface the stale
    // result without rolling the 'expired' write back with it.
    if ('expired' in outcome) {
      throw new TRPCError({ code: 'CONFLICT', message: APPROVAL_STALE });
    }
    return outcome.decided;
  };

  /**
   * Scoped one-shot consumption bound to a stable dispatch (SC05):
   *
   * - the full expected scope and revision are validated INSIDE the same
   *   lock/transaction that marks the grant — a wrong-target or stale-revision
   *   request cannot consume (or even mutate) someone else's approval;
   * - the winning consume stamps `consumedByDispatchId`, so a retry of the
   *   SAME dispatch re-adopts the grant it already holds (`adopted`) instead
   *   of re-consuming — and a consumed grant is never reset for another
   *   request;
   * - a grant consumed by a DIFFERENT dispatch reports `unavailable`, exactly
   *   like a grant consumed before dispatch binding existed.
   */
  consumeForDispatch = async (params: {
    approvalId: string;
    dispatchId: string;
    expected: {
      actionType: string;
      /** The resource version the approval must have been issued against. */
      baseVersion?: number | null;
      targetId: string;
      targetType: string;
      workspaceId: string | null;
    };
  }): Promise<ConsumeForDispatchOutcome> =>
    this.db.transaction(async (tx) => {
      const [approval] = await tx
        .select()
        .from(actionApprovals)
        .where(eq(actionApprovals.id, params.approvalId))
        .for('update')
        .limit(1);
      if (!approval) return { kind: 'missing' };

      // Retry adoption first: this dispatch already owns the grant — a
      // transient failure after the consume must not force re-approval.
      if (approval.consumedByDispatchId === params.dispatchId && approval.consumedAt) {
        return { approval, kind: 'adopted' };
      }
      if (approval.status !== 'approved' || approval.consumedAt) {
        return { approval, kind: 'unavailable' };
      }
      if (
        approval.actionType !== params.expected.actionType ||
        approval.targetType !== params.expected.targetType ||
        approval.targetId !== params.expected.targetId ||
        approval.workspaceId !== params.expected.workspaceId
      ) {
        return { approval, kind: 'scope_mismatch' };
      }
      if (approval.expiresAt && approval.expiresAt.getTime() <= Date.now()) {
        return { approval, kind: 'expired' };
      }
      if (
        params.expected.baseVersion !== undefined &&
        approval.baseVersion != null &&
        approval.baseVersion !== params.expected.baseVersion
      ) {
        return { approval, kind: 'revision_mismatch' };
      }
      if (!approval.approverUserId) {
        return { approval, kind: 'no_approver' };
      }

      const [updated] = await tx
        .update(actionApprovals)
        .set({ consumedAt: new Date(), consumedByDispatchId: params.dispatchId })
        .where(
          and(
            eq(actionApprovals.id, approval.id),
            eq(actionApprovals.status, 'approved'),
            isNull(actionApprovals.consumedAt),
          ),
        )
        .returning();
      if (!updated) return { approval, kind: 'unavailable' };
      return { approval: updated, kind: 'consumed' };
    });

  /**
   * One-shot consumption of an approved grant: the first consumer flips
   * `consumedAt` and wins; later callers get null and must re-request. The
   * approval is intentionally not re-decided — it is spent.
   *
   * Prefer {@link consumeForDispatch}: it validates the full scope inside the
   * same transaction and binds the spend to a stable dispatch so retries of
   * one logical run adopt instead of re-consuming.
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
