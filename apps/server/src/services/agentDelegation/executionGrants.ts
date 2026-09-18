import { TRPCError } from '@trpc/server';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { OrviloDatabase, Transaction } from '@/database/type';

import {
  executionGrants,
  getActiveWorkspaceMembershipRole,
  insertOutboxEvent,
  newEventId,
  taskTopics,
  WorkspaceMemberModel,
} from './contractTables';
import { evaluateGrant, isEpochCurrent } from './evaluate';
import {
  DEFAULT_ALLOWED_ACTIONS,
  type DelegationAction,
  type DelegationSubjectType,
} from './types';

const ACTIVE_MEMBER_STATUSES = (member: { deletedAt: Date | null; suspendedAt?: Date | null } | undefined | null) =>
  !!member && !member.deletedAt && !member.suspendedAt;

export interface CreateGrantInput {
  agentId: string;
  allowedActions?: string[];
  delegationSubjectId?: string;
  delegationSubjectType?: DelegationSubjectType;
  expiresAt?: Date;
  task: {
    id: string;
    projectId: string | null;
    workspaceId: string | null;
  };
}

export interface ValidateGrantInput {
  action: DelegationAction | string;
  grantId: string;
}

/**
 * Execution-grant lifecycle: create → validate at run start → revoke/expire.
 * Every run attributed to a delegation carries `initiatedBy` (who pressed the
 * button) and the delegation subject (whose authority the run consumes).
 */
export class AgentDelegationService {
  private readonly db: OrviloDatabase;
  private readonly memberModel: WorkspaceMemberModel;
  private readonly userId: string;
  private readonly workspaceId?: string;

  constructor(db: OrviloDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.memberModel = new WorkspaceMemberModel(db, userId);
  }

  private isActiveMember = async (workspaceId: string, userId: string) => {
    const member = await this.memberModel.getMember(workspaceId, userId);
    return ACTIVE_MEMBER_STATUSES(member);
  };

  /**
   * Mint a grant on `task` for `agentId`. The delegation subject defaults to
   * the caller — the human whose authority the agent borrows. Callers verify
   * task visibility and run-capability before reaching this service.
   */
  createGrant = async (input: CreateGrantInput) => {
    const workspaceId = input.task.workspaceId ?? this.workspaceId;
    if (!workspaceId || input.task.workspaceId !== workspaceId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
    }

    const subjectType: DelegationSubjectType = input.delegationSubjectType ?? 'user';
    const subjectId = input.delegationSubjectId ?? this.userId;

    if (subjectType === 'user' && !(await this.isActiveMember(workspaceId, subjectId))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Delegation subject is not an active workspace member',
      });
    }

    const allowedActions =
      input.allowedActions && input.allowedActions.length > 0
        ? input.allowedActions
        : [...DEFAULT_ALLOWED_ACTIONS];

    const member = await this.memberModel.getMember(workspaceId, subjectId);

    const [grant] = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(executionGrants)
        .values({
          agentId: input.agentId,
          allowedActions,
          // `Record<string, number>` — omit the entry rather than store null
          // when the subject is a non-member automation policy.
          authzVersions: member ? { workspaceAuthzVersion: member.authzVersion } : {},
          delegationSubjectId: subjectId,
          delegationSubjectType: subjectType,
          expiresAt: input.expiresAt ?? null,
          id: randomUUID(),
          initiatedBy: this.userId,
          projectId: input.task.projectId,
          status: 'active',
          taskId: input.task.id,
          workspaceId,
        })
        .returning();

      await insertOutboxEvent(tx, {
        aggregateId: input.task.id,
        aggregateType: 'task',
        eventId: newEventId(),
        eventType: 'task.delegation.created',
        payload: {
          agentId: input.agentId,
          delegationSubjectId: subjectId,
          delegationSubjectType: subjectType,
          grantId: created.id,
          initiatedBy: this.userId,
          projectId: input.task.projectId,
          taskId: input.task.id,
          workspaceId,
        },
        workspaceId,
      });

      return [created];
    });

    return grant;
  };

  /**
   * Run-start check. Returns the grant when the run may proceed; throws a
   * typed error otherwise. Never substitutes another principal — an inactive
   * subject revokes the grant rather than re-attributing it.
   */
  validateGrantForRun = async (input: ValidateGrantInput) => {
    const workspaceId = this.workspaceId;
    if (!workspaceId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
    }

    const [grant] = await this.db
      .select()
      .from(executionGrants)
      .where(eq(executionGrants.id, input.grantId))
      .limit(1);

    const subjectActive =
      grant?.delegationSubjectType === 'user' && grant.delegationSubjectId
        ? await this.isActiveMember(workspaceId, grant.delegationSubjectId)
        : false;

    const verdict = evaluateGrant(grant, {
      action: input.action,
      now: new Date(),
      subjectActive,
      workspaceId,
    });

    if (verdict.ok) return grant;

    // A dead subject is a terminal state, not a transient denial — revoke so
    // later attempts fail fast instead of re-probing membership forever.
    if (verdict.denial === 'subject_inactive' && grant) {
      await this.markRevoked(grant.id);
    }
    if (verdict.denial === 'expired' && grant) {
      await this.markExpired([grant.id]);
    }

    throw new TRPCError({
      code: verdict.denial === 'foreign_workspace' ? 'NOT_FOUND' : 'FORBIDDEN',
      message: `Execution grant denied: ${verdict.denial}`,
    });
  };

  /** Explicit revocation — by the delegator or anyone with run capability. */
  revokeGrant = async (grantId: string) => {
    const workspaceId = this.workspaceId;
    const [grant] = await this.db
      .select()
      .from(executionGrants)
      .where(eq(executionGrants.id, grantId))
      .limit(1);

    if (!grant || grant.workspaceId !== workspaceId) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Delegation grant not found' });
    }

    // The status flip and its room event commit in ONE transaction: if the
    // outbox insert fails the revocation rolls back too, so a retry still
    // emits the event instead of finding a terminal grant that never
    // published. Idempotency comes from the conditional update's row count —
    // only a row that was still 'active' transitions and publishes.
    const revokedAt = new Date();
    const revoked = await this.db.transaction(async (tx) => {
      const didRevoke = await this.markRevoked(grant.id, tx);
      if (!didRevoke) return false;

      // No task bound → no task room to notify; the revocation still stands.
      if (grant.taskId) {
        await insertOutboxEvent(tx, {
          aggregateId: grant.taskId,
          aggregateType: 'task',
          eventId: newEventId(),
          eventType: 'task.delegation.revoked',
          payload: {
            agentId: grant.agentId,
            grantId: grant.id,
            revokedBy: this.userId,
            taskId: grant.taskId,
            workspaceId: grant.workspaceId,
          },
          workspaceId: grant.workspaceId,
        });
      }
      return true;
    });

    if (!revoked) return grant; // already terminal — idempotent
    return { ...grant, revokedAt, status: 'revoked' };
  };

  /**
   * Membership lifecycle hook: when a member is removed/suspended, every grant
   * they delegated dies with their authority. Used by the membership worker —
   * runs are never silently re-parented onto the owner.
   */
  revokeGrantsForSubject = async (params: { subjectId: string; workspaceId: string }) => {
    const now = new Date();
    const revoked = await this.db
      .update(executionGrants)
      .set({ revokedAt: now, status: 'revoked', updatedAt: now })
      .where(
        and(
          eq(executionGrants.workspaceId, params.workspaceId),
          eq(executionGrants.delegationSubjectType, 'user'),
          eq(executionGrants.delegationSubjectId, params.subjectId),
          eq(executionGrants.status, 'active'),
        ),
      )
      .returning({ id: executionGrants.id, taskId: executionGrants.taskId });
    return revoked;
  };

  /**
   * Conditional flip to 'revoked' — returns false when the row was already
   * terminal, which is what makes callers idempotent. `executor` lets the
   * revocation ride inside a caller's transaction (see `revokeGrant`).
   */
  private markRevoked = async (
    grantId: string,
    executor: OrviloDatabase | Transaction = this.db,
  ) => {
    const now = new Date();
    const rows = await executor
      .update(executionGrants)
      .set({ revokedAt: now, status: 'revoked', updatedAt: now })
      .where(and(eq(executionGrants.id, grantId), eq(executionGrants.status, 'active')))
      .returning({ id: executionGrants.id });
    return rows.length > 0;
  };

  private markExpired = async (grantIds: string[]) => {
    if (grantIds.length === 0) return;
    const now = new Date();
    await this.db
      .update(executionGrants)
      .set({ status: 'expired', updatedAt: now })
      .where(and(inArray(executionGrants.id, grantIds), eq(executionGrants.status, 'active')));
  };

  /** Sweep helper for the scheduler: lapse active grants past `expiresAt`. */
  expireDueGrants = async (now = new Date()) => {
    const expired = await this.db
      .update(executionGrants)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          eq(executionGrants.status, 'active'),
          lt(executionGrants.expiresAt, now),
        ),
      )
      .returning({ id: executionGrants.id });
    return expired.length;
  };

  /**
   * Fencing claim: bind a grant to a task_topics run and advance the row's
   * execution epoch. The returned epoch is the fencing token — anything still
   * holding the previous epoch is stale, regardless of lease timers. Runs are
   * keyed by the table's unique (taskId, topicId) pair — that's what the
   * runner holds when the row is created. Pass `tx` to make the claim
   * atomic with the transaction that creates the run row.
   */
  claimExecutionEpoch = async (
    params: { grantId: string; taskId: string; topicId: string },
    executor: OrviloDatabase | Transaction = this.db,
  ) => {
    const [row] = await executor
      .update(taskTopics)
      .set({
        executionEpoch: sql`coalesce(${taskTopics.executionEpoch}, 0) + 1`,
        executionGrantId: params.grantId,
      })
      .where(
        and(eq(taskTopics.taskId, params.taskId), eq(taskTopics.topicId, params.topicId)),
      )
      .returning({ executionEpoch: taskTopics.executionEpoch });

    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Task run not found' });
    }
    return row.executionEpoch as number;
  };

  /**
   * Fencing check before a delegated run commits work: the epoch it claimed
   * must still be current on the task_topics row and still bound to its grant.
   */
  assertExecutionEpoch = async (params: {
    epoch: number;
    grantId: string;
    taskId: string;
    topicId: string;
  }) => {
    const [topic] = await this.db
      .select({
        executionEpoch: taskTopics.executionEpoch,
        executionGrantId: taskTopics.executionGrantId,
      })
      .from(taskTopics)
      .where(
        and(eq(taskTopics.taskId, params.taskId), eq(taskTopics.topicId, params.topicId)),
      )
      .limit(1);

    if (!isEpochCurrent(topic, { epoch: params.epoch, grantId: params.grantId })) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Execution superseded by a newer delegation epoch',
      });
    }
  };

  /**
   * Convenience for the run path: fetch the caller's active workspace role.
   * Kept here so every delegating entry point shares one membership probe.
   */
  getActiveRole = () =>
    getActiveWorkspaceMembershipRole(this.db, {
      userId: this.userId,
      workspaceId: this.workspaceId ?? '',
    });
}

/** Re-export for callers that need the membership probe standalone. */
export { ACTIVE_MEMBER_STATUSES as isActiveMemberRecord };
