// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LobeChatDatabase } from '@/database/type';
import { cleanupTestUser, createTestUser } from '@/server/routers/lambda/__tests__/integration/setup';
import { uuid } from '@/utils/uuid';

import { ActionApprovalService } from '../actionApprovals';
import { actionApprovals, tasks, workspaceMembers, workspaces } from '../contractTables';
import { AgentDelegationService } from '../executionGrants';
import { TaskInputService } from '../taskInputs';

const createWorkspace = async (db: LobeChatDatabase, ownerId: string) => {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Delegation test', primaryOwnerId: ownerId, slug: `dlg-${uuid()}` })
    .returning();
  return workspace;
};

const createTask = async (
  db: LobeChatDatabase,
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
  let db: LobeChatDatabase;
  let memberId: string;
  let ownerId: string;
  let outsiderId: string;
  let taskId: string;
  let workspaceId: string;

  beforeEach(async () => {
    db = await getTestDB();
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
        callerIsWorkspaceAdmin: false,
        decision: 'approved',
      });
      expect(await service.consume(approval.id)).not.toBeNull();
      expect(await service.consume(approval.id)).toBeNull();
    });
  });
});
