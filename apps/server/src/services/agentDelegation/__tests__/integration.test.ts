// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EventOutboxModel from '@/database/models/eventOutbox';
import { insertOutboxEvent } from '@/database/models/eventOutbox';
import type { OrviloDatabase } from '@/database/type';
import {
  cleanupTestUser,
  createTestUser,
} from '@/server/routers/lambda/__tests__/integration/setup';
import { outboxRowToActivityEvent } from '@/server/services/collaboration/projection';
import { uuid } from '@/utils/uuid';

import { ActionApprovalService } from '../actionApprovals';
import {
  actionApprovals,
  agents,
  eventOutbox,
  executionGrants,
  tasks,
  taskTopics,
  topics,
  workspaceMembers,
  workspaces,
} from '../contractTables';
import { AgentDelegationService } from '../executionGrants';
import { TaskInputService } from '../taskInputs';

// The outbox writer is spied — not stubbed — so revocation tests can fail a
// single insert while every other event keeps flowing through the real model.
vi.mock('@/database/models/eventOutbox', async (importOriginal) => {
  const mod = await importOriginal<typeof EventOutboxModel>();
  return { ...mod, insertOutboxEvent: vi.fn(mod.insertOutboxEvent) };
});

const createWorkspace = async (db: OrviloDatabase, ownerId: string) => {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Delegation test', primaryOwnerId: ownerId, slug: `dlg-${uuid()}` })
    .returning();
  return workspace;
};

const createTask = async (
  db: OrviloDatabase,
  params: { creatorId: string; seq?: number; workspaceId: string },
) => {
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: params.creatorId,
      identifier: `T-${params.seq ?? 1}`,
      instruction: 'do the thing',
      seq: params.seq ?? 1,
      workspaceId: params.workspaceId,
    })
    .returning();
  return task;
};

describe('agentDelegation services (integration)', () => {
  let db: OrviloDatabase;
  let memberId: string;
  let ownerId: string;
  let outsiderId: string;
  let taskId: string;
  let workspaceId: string;

  beforeEach(async () => {
    db = await getTestDB();
    vi.mocked(insertOutboxEvent).mockClear();
    [ownerId, memberId, outsiderId] = await Promise.all([
      createTestUser(db),
      createTestUser(db),
      createTestUser(db),
    ]);
    const workspace = await createWorkspace(db, ownerId);
    workspaceId = workspace.id;
    await db.insert(workspaceMembers).values([
      { role: 'owner', userId: ownerId, workspaceId },
      { role: 'member', userId: memberId, workspaceId },
    ]);
    const task = await createTask(db, { creatorId: ownerId, workspaceId });
    taskId = task.id;
    // Grants FK to agents — the delegation subject must be a real agent row.
    await db.insert(agents).values({ id: 'agt_worker', userId: ownerId, workspaceId });
  });

  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await Promise.all([ownerId, memberId, outsiderId].map((id) => cleanupTestUser(db, id)));
  });

  describe('TaskInputService.submit', () => {
    it('assigns a per-task monotonic sequence', async () => {
      const service = new TaskInputService(db, memberId, workspaceId);
      const first = await service.submit({
        idempotencyKey: 'k-1',
        intentType: 'comment',
        payload: { text: 'one' },
        taskId,
      });
      const second = await service.submit({
        idempotencyKey: 'k-2',
        intentType: 'comment',
        payload: { text: 'two' },
        taskId,
      });
      expect(first.input.sequence).toBe(1);
      expect(second.input.sequence).toBe(2);
      expect(second.input.authorUserId).toBe(memberId);
    });

    it('dedupes on idempotencyKey and returns the original row', async () => {
      const service = new TaskInputService(db, memberId, workspaceId);
      const params = {
        idempotencyKey: 'same-key',
        intentType: 'proposal' as const,
        payload: { text: 'proposal' },
        taskId,
      };
      const first = await service.submit(params);
      const replay = await service.submit(params);

      expect(replay.input.id).toBe(first.input.id);
      expect(replay.deduplicated).toBe(true);

      const all = await service.list({ taskId });
      expect(all).toHaveLength(1);
    });
  });

  describe('AgentDelegationService', () => {
    it('creates and validates a grant, then rejects it once revoked', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        allowedActions: ['run'],
        task: { id: taskId, projectId: null, workspaceId },
      });
      expect(grant.status).toBe('active');

      const validated = await service.validateGrantForRun({ action: 'run', grantId: grant.id });
      expect(validated.id).toBe(grant.id);

      await service.revokeGrant(grant.id);
      await expect(
        service.validateGrantForRun({ action: 'run', grantId: grant.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects an action outside the grant whitelist', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        allowedActions: ['run'],
        task: { id: taskId, projectId: null, workspaceId },
      });
      await expect(
        service.validateGrantForRun({ action: 'steer', grantId: grant.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects validation from a foreign workspace as NOT_FOUND', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        task: { id: taskId, projectId: null, workspaceId },
      });
      const foreign = new AgentDelegationService(db, outsiderId, 'ws_other');
      await expect(
        foreign.validateGrantForRun({ action: 'run', grantId: grant.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('revokes the grant when the delegation subject leaves — no substitution', async () => {
      const service = new AgentDelegationService(db, memberId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        task: { id: taskId, projectId: null, workspaceId },
      });

      // Subject removed from the workspace.
      await db
        .update(workspaceMembers)
        .set({ deletedAt: new Date() })
        .where(eq(workspaceMembers.userId, memberId));

      await expect(
        service.validateGrantForRun({ action: 'run', grantId: grant.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects an expired grant', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        expiresAt: new Date(Date.now() - 1000),
        task: { id: taskId, projectId: null, workspaceId },
      });
      await expect(
        service.validateGrantForRun({ action: 'run', grantId: grant.id }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('claims and asserts an execution epoch, fencing off a superseded holder', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        task: { id: taskId, projectId: null, workspaceId },
      });
      const superseding = await service.createGrant({
        agentId: 'agt_worker',
        task: { id: taskId, projectId: null, workspaceId },
      });
      await db.insert(topics).values({ id: 'tpc_run-1', userId: ownerId });
      await db
        .insert(taskTopics)
        .values({ seq: 1, taskId, topicId: 'tpc_run-1', userId: ownerId, workspaceId });

      const epoch = await service.claimExecutionEpoch({
        grantId: grant.id,
        taskId,
        topicId: 'tpc_run-1',
      });
      expect(epoch).toBe(1);

      const [runRow] = await db
        .select()
        .from(taskTopics)
        .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, 'tpc_run-1')));
      expect(runRow.executionGrantId).toBe(grant.id);

      await expect(
        service.assertMayCommit({ epoch, grantId: grant.id, taskId, topicId: 'tpc_run-1' }),
      ).resolves.toBeUndefined();

      // A superseding delegation claims the next epoch — the old fencing
      // token is stale even though nothing "cancelled" the first run.
      const newer = await service.claimExecutionEpoch({
        grantId: superseding.id,
        taskId,
        topicId: 'tpc_run-1',
      });
      expect(newer).toBe(2);
      await expect(
        service.assertMayCommit({ epoch, grantId: grant.id, taskId, topicId: 'tpc_run-1' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('assertMayCommit rejects a run row that does not exist', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      await expect(
        service.assertMayCommit({
          epoch: 1,
          grantId: 'grant-x',
          taskId,
          topicId: 'tpc_missing',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('refuses to claim an epoch for a revoked grant', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        task: { id: taskId, projectId: null, workspaceId },
      });
      await service.revokeGrant(grant.id);
      await db.insert(topics).values({ id: 'tpc_revoked', userId: ownerId });
      await db
        .insert(taskTopics)
        .values({ seq: 2, taskId, topicId: 'tpc_revoked', userId: ownerId, workspaceId });

      await expect(
        service.claimExecutionEpoch({ grantId: grant.id, taskId, topicId: 'tpc_revoked' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies the commit when the grant was revoked after the epoch was claimed', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        task: { id: taskId, projectId: null, workspaceId },
      });
      await db.insert(topics).values({ id: 'tpc_revoke-mid', userId: ownerId });
      await db
        .insert(taskTopics)
        .values({ seq: 3, taskId, topicId: 'tpc_revoke-mid', userId: ownerId, workspaceId });
      const epoch = await service.claimExecutionEpoch({
        grantId: grant.id,
        taskId,
        topicId: 'tpc_revoke-mid',
      });

      // The window the audit called out: claim passes, then the grant dies.
      await service.revokeGrant(grant.id);

      await expect(
        service.assertMayCommit({ epoch, grantId: grant.id, taskId, topicId: 'tpc_revoke-mid' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies the commit when the grant lapses after the epoch was claimed', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        expiresAt: new Date(Date.now() + 60_000),
        task: { id: taskId, projectId: null, workspaceId },
      });
      await db.insert(topics).values({ id: 'tpc_expire-mid', userId: ownerId });
      await db
        .insert(taskTopics)
        .values({ seq: 4, taskId, topicId: 'tpc_expire-mid', userId: ownerId, workspaceId });
      const epoch = await service.claimExecutionEpoch({
        grantId: grant.id,
        taskId,
        topicId: 'tpc_expire-mid',
      });

      // The expiry sweep hasn't run yet — the row is still 'active' but past
      // its deadline. The fence reads the deadline, not just the status.
      await db
        .update(executionGrants)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(executionGrants.id, grant.id));

      await expect(
        service.assertMayCommit({ epoch, grantId: grant.id, taskId, topicId: 'tpc_expire-mid' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies the commit when the delegation subject loses membership mid-run', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        delegationSubjectId: memberId,
        task: { id: taskId, projectId: null, workspaceId },
      });
      await db.insert(topics).values({ id: 'tpc_member-mid', userId: ownerId });
      await db
        .insert(taskTopics)
        .values({ seq: 5, taskId, topicId: 'tpc_member-mid', userId: ownerId, workspaceId });
      const epoch = await service.claimExecutionEpoch({
        grantId: grant.id,
        taskId,
        topicId: 'tpc_member-mid',
      });

      await db
        .update(workspaceMembers)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)),
        );

      await expect(
        service.assertMayCommit({ epoch, grantId: grant.id, taskId, topicId: 'tpc_member-mid' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies the commit when the subject membership authorization version moved', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        delegationSubjectId: memberId,
        task: { id: taskId, projectId: null, workspaceId },
      });
      await db.insert(topics).values({ id: 'tpc_authz-mid', userId: ownerId });
      await db
        .insert(taskTopics)
        .values({ seq: 6, taskId, topicId: 'tpc_authz-mid', userId: ownerId, workspaceId });
      const epoch = await service.claimExecutionEpoch({
        grantId: grant.id,
        taskId,
        topicId: 'tpc_authz-mid',
      });

      // A role change / re-invite bumps authzVersion on the member row — the
      // version the grant captured at issuance no longer matches.
      await db
        .update(workspaceMembers)
        .set({ authzVersion: 99 })
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)),
        );

      await expect(
        service.assertMayCommit({ epoch, grantId: grant.id, taskId, topicId: 'tpc_authz-mid' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('revokes and publishes the event atomically — a failed insert rolls the status back', async () => {
      const service = new AgentDelegationService(db, ownerId, workspaceId);
      const grant = await service.createGrant({
        agentId: 'agt_worker',
        task: { id: taskId, projectId: null, workspaceId },
      });

      const grantRow = async () =>
        (await db.select().from(executionGrants).where(eq(executionGrants.id, grant.id)))[0];
      const revokeEvents = async () =>
        db
          .select()
          .from(eventOutbox)
          .where(
            and(
              eq(eventOutbox.aggregateId, taskId),
              eq(eventOutbox.eventType, 'task.delegation.revoked'),
            ),
          );

      // Fail the event insert: the whole transaction must roll back, leaving
      // the grant 'active' so a retry can still publish — the old flow left a
      // terminal grant with no event and every retry early-returned.
      vi.mocked(insertOutboxEvent).mockRejectedValueOnce(new Error('outbox down'));
      await expect(service.revokeGrant(grant.id)).rejects.toThrow('outbox down');
      expect((await grantRow()).status).toBe('active');
      expect(await revokeEvents()).toHaveLength(0);

      const revoked = await service.revokeGrant(grant.id);
      expect(revoked.status).toBe('revoked');
      expect(await revokeEvents()).toHaveLength(1);

      // Idempotent: a second revocation publishes nothing new.
      await service.revokeGrant(grant.id);
      expect(await revokeEvents()).toHaveLength(1);
    });
  });

  describe('ActionApprovalService.decide', () => {
    const insertApproval = async (overrides: Record<string, unknown> = {}) => {
      const [approval] = await db
        .insert(actionApprovals)
        .values({
          actionType: 'task.merge',
          approverUserId: ownerId,
          baseSha: 'sha-1',
          baseVersion: 7,
          requestedBy: memberId,
          status: 'pending',
          targetId: taskId,
          targetType: 'task',
          workspaceId,
          ...overrides,
        })
        .returning();
      return approval;
    };

    it('lets the recorded approver approve a matching base', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, ownerId, workspaceId);
      const decided = await service.decide({
        approvalId: approval.id,
        baseSha: 'sha-1',
        baseVersion: 7,
        callerIsWorkspaceAdmin: false,
        decision: 'approved',
      });
      expect(decided.status).toBe('approved');
      expect(decided.decidedAt).not.toBeNull();
    });

    it('rejects a stale baseVersion as CONFLICT', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, ownerId, workspaceId);
      await expect(
        service.decide({
          approvalId: approval.id,
          baseSha: 'sha-1',
          baseVersion: 8,
          callerIsWorkspaceAdmin: false,
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', message: 'approval no longer valid' });
    });

    it('rejects a stale baseSha as CONFLICT', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, ownerId, workspaceId);
      await expect(
        service.decide({
          approvalId: approval.id,
          baseSha: 'sha-2',
          baseVersion: 7,
          callerIsWorkspaceAdmin: false,
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects a decision that omits the recorded base', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, ownerId, workspaceId);
      // A recorded base must be echoed — omitting it skips the drift check.
      await expect(
        service.decide({
          approvalId: approval.id,
          callerIsWorkspaceAdmin: false,
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('rejects a non-approver non-admin', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, memberId, workspaceId);
      await expect(
        service.decide({
          approvalId: approval.id,
          callerIsWorkspaceAdmin: false,
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('lets a workspace admin decide instead of the recorded approver', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, memberId, workspaceId);
      const decided = await service.decide({
        approvalId: approval.id,
        baseSha: 'sha-1',
        baseVersion: 7,
        callerIsWorkspaceAdmin: true,
        decision: 'rejected',
      });
      expect(decided.status).toBe('rejected');
    });

    it('consumes an approved approval exactly once', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, ownerId, workspaceId);
      await service.decide({
        approvalId: approval.id,
        baseSha: 'sha-1',
        baseVersion: 7,
        callerIsWorkspaceAdmin: false,
        decision: 'approved',
      });
      expect(await service.consume(approval.id)).not.toBeNull();
      expect(await service.consume(approval.id)).toBeNull();
    });

    it('persists the expired status when a lapsed approval is decided', async () => {
      const approval = await insertApproval({ expiresAt: new Date(Date.now() - 1000) });
      const service = new ActionApprovalService(db, ownerId, workspaceId);
      await expect(
        service.decide({
          approvalId: approval.id,
          baseSha: 'sha-1',
          baseVersion: 7,
          callerIsWorkspaceAdmin: false,
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', message: 'approval no longer valid' });
      // Regression: the CONFLICT must not roll the lapse write back — the row
      // stays 'expired', not 'pending'.
      const [row] = await db
        .select()
        .from(actionApprovals)
        .where(eq(actionApprovals.id, approval.id));
      expect(row.status).toBe('expired');
    });

    it('publishes a complete activity event the projection replays verbatim', async () => {
      const approval = await insertApproval();
      const service = new ActionApprovalService(db, ownerId, workspaceId);
      await service.decide({
        approvalId: approval.id,
        baseSha: 'sha-1',
        baseVersion: 7,
        callerIsWorkspaceAdmin: false,
        decision: 'approved',
      });

      const [event] = await db
        .select()
        .from(eventOutbox)
        .where(
          and(
            eq(eventOutbox.aggregateId, taskId),
            eq(eventOutbox.eventType, 'collaboration.activity'),
          ),
        );
      expect(event).toBeDefined();
      const payload = event.payload as Record<string, unknown>;
      // The payload's eventId must equal the outbox row id — the projector
      // hands the payload through verbatim and consumers dedup on eventId.
      expect(payload.eventId).toBe(event.eventId);
      expect(payload).toMatchObject({
        action: 'approval.approved',
        actor: { id: ownerId, kind: 'human' },
        entityVersion: 7,
        phase: 'committed',
        target: { anchor: 'status', entityId: taskId, entityType: 'task' },
        workspaceId,
      });
      expect(typeof payload.occurredAt).toBe('string');
      expect(typeof payload.expiresAt).toBe('string');
      expect(typeof payload.projectId).toBe('string');
      // Not merely well-formed — the projection must recognize it as a real
      // ServerActivityEvent (the old payload fell back to a generic
      // invalidate/synthesized marker with a different eventId).
      expect(outboxRowToActivityEvent(event)).toMatchObject({
        action: 'approval.approved',
        eventId: event.eventId,
        target: { entityId: taskId, entityType: 'task' },
      });
    });
  });
});
