// @vitest-environment node
import { randomUUID } from 'node:crypto';

import type { DurableReceipt } from '@orvilo/agent-execution';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TaskModel } from '@/database/models/task';
import {
  agentOperations,
  executionGrants,
  taskDispatches,
  tasks,
  taskTopics,
  verifyCheckResults,
  verifyCriteria,
  verifyRuns,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import { CanonicalVerifyCompletion } from './canonicalCompletion';
import type { CanonicalRunBinding } from './canonicalRun';
import { createCanonicalRunFixture, fixtureTaskId } from './canonicalRun.test-utils';

describe('canonical completion admission', () => {
  let db: OrviloDatabase;
  let binding: CanonicalRunBinding;
  beforeEach(async () => {
    db = await getTestDB();
    binding = await createCanonicalRunFixture(db);
    await db.insert(agentOperations).values({
      id: binding.operationId,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      taskId: fixtureTaskId(binding),
      topicId: binding.topicId,
      status: 'done',
    });
    await db
      .update(taskDispatches)
      .set({ phase: 'succeeded' })
      .where(eq(taskDispatches.id, binding.dispatchId));
  });
  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
    await cleanupTestUser(db, binding.userId);
  });
  const evidence = () => ({
    mappings: [
      {
        checkItemId: 'check',
        sourceCriterionId: randomUUID(),
        receiptId: 'receipt',
        requestDigest: 'digest',
      },
    ],
    loadReceipt: async () => undefined,
  });
  it('does not derive completion from a successful operation or absent receipt mapping', async () => {
    expect(await new CanonicalVerifyCompletion(db).reconcile(binding)).toEqual({
      state: 'denied',
      reason: 'receipt_mapping_unavailable',
    });
    expect(await new CanonicalVerifyCompletion(db).reconcile(binding, evidence())).toEqual({
      state: 'denied',
      reason: 'verification_not_passed',
    });
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, fixtureTaskId(binding)));
    expect(task.status).toBe('running');
  });
  it('rejects a persisted passed run without a confirmed nonempty criterion plan', async () => {
    await db.insert(verifyRuns).values({
      operationId: binding.operationId,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      status: 'passed',
      plan: [],
      planConfirmedAt: new Date(),
    });
    expect(await new CanonicalVerifyCompletion(db).reconcile(binding, evidence())).toEqual({
      state: 'denied',
      reason: 'verification_not_passed',
    });
  });
  it('rejects foreign operation and superseded dispatch identity before receipt loading', async () => {
    expect(
      await new CanonicalVerifyCompletion(db).reconcile(
        { ...binding, operationId: 'foreign' },
        evidence(),
      ),
    ).toEqual({ state: 'denied', reason: 'run_binding_changed' });
    await db
      .update(taskDispatches)
      .set({ fence: binding.dispatchFence + 1 })
      .where(eq(taskDispatches.id, binding.dispatchId));
    expect(await new CanonicalVerifyCompletion(db).reconcile(binding, evidence())).toEqual({
      state: 'denied',
      reason: 'dispatch_contract_changed',
    });
  });
  async function acceptedEvidence() {
    const [criterion] = await db
      .insert(verifyCriteria)
      .values({
        userId: binding.userId,
        workspaceId: binding.workspaceId,
        title: 'file receipt',
        verifierType: 'program',
      })
      .returning();
    const [verify] = await db
      .insert(verifyRuns)
      .values({
        operationId: binding.operationId,
        userId: binding.userId,
        workspaceId: binding.workspaceId,
        status: 'passed',
        planConfirmedAt: new Date(),
        plan: [
          {
            id: 'check',
            index: 0,
            title: 'file receipt',
            required: true,
            onFail: 'manual',
            sourceCriterionId: criterion.id,
            verifierType: 'program',
            verifierConfig: {},
          },
        ],
      })
      .returning();
    await db.insert(verifyCheckResults).values({
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      verifyRunId: verify.id,
      checkItemId: 'check',
      sourceCriterionId: criterion.id,
      verifierType: 'program',
      verdict: 'passed',
    });
    const receipt: DurableReceipt = {
      schemaVersion: 1,
      id: 'receipt',
      requestDigest: 'digest',
      idempotencyKey: 'key',
      commitmentId: 'commitment',
      actionKind: 'file.write',
      status: 'verified',
      createdAt: 1,
      updatedAt: 1,
      evidence: ['hash'],
      fence: {
        tenantId: binding.workspaceId,
        principalId: binding.userId,
        taskId: fixtureTaskId(binding),
        grantId: binding.grantId,
        ownerId: binding.runtimeOwnerId,
        leaseId: binding.runtimeLeaseId,
        epoch: binding.executionEpoch,
        policyRevision: binding.policyRevision,
        stateRevision: binding.stateRevision,
      },
    };
    return {
      mappings: [
        {
          checkItemId: 'check',
          sourceCriterionId: criterion.id,
          receiptId: receipt.id,
          requestDigest: receipt.requestDigest,
        },
      ],
      loadReceipt: async () => receipt,
    };
  }

  async function commit(mapped: Awaited<ReturnType<typeof acceptedEvidence>>) {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, fixtureTaskId(binding)));
    const adapter = new CanonicalVerifyCompletion(db);
    return new TaskModel(db, binding.userId, binding.workspaceId).updateStatusForExecutionContract(
      fixtureTaskId(binding),
      'completed',
      {
        assigneeAgentId: task.assigneeAgentId,
        executionGeneration: binding.generation,
        policyRevision: binding.policyRevision,
        requirementRevision: task.requirementRevision,
      },
      undefined,
      { suppressDomainEvent: true },
      (tx) => adapter.authorizeAtCommit(tx, binding, mapped),
    );
  }

  it('authorizes the exact canonical completion CAS with persisted passed criteria and mapped receipt', async () => {
    expect(await commit(await acceptedEvidence())).toMatchObject({
      workflowCategory: 'done',
    });
  });

  it.each(['revoked', 'epoch'] as const)(
    'denies %s at the actual completion mutation transaction',
    async (change) => {
      const mapped = await acceptedEvidence();
      if (change === 'revoked')
        await db
          .update(executionGrants)
          .set({ status: 'revoked' })
          .where(eq(executionGrants.id, binding.grantId));
      else
        await db
          .update(taskTopics)
          .set({ executionEpoch: binding.executionEpoch + 1 })
          .where(eq(taskTopics.topicId, binding.topicId));
      expect(await commit(mapped)).toBeNull();
      expect(
        (
          await db
            .select()
            .from(tasks)
            .where(eq(tasks.id, fixtureTaskId(binding)))
        )[0].status,
      ).toBe('running');
    },
  );
  it('invokes the actual Verify convergence for a passed mapped completed run', async () => {
    const mapped = await acceptedEvidence();
    await db
      .update(taskTopics)
      .set({ status: 'completed' })
      .where(eq(taskTopics.topicId, binding.topicId));
    expect(await new CanonicalVerifyCompletion(db).reconcile(binding, mapped)).toMatchObject({
      state: 'observed',
      taskStatus: 'completed',
      completed: true,
    });
  }, 30_000);

  it('refuses takeover occurring while receipt loading awaits before actual convergence', async () => {
    const mapped = await acceptedEvidence();
    await db
      .update(taskTopics)
      .set({ status: 'completed' })
      .where(eq(taskTopics.topicId, binding.topicId));
    const read = mapped.loadReceipt;
    let advanced = false;
    mapped.loadReceipt = async () => {
      if (!advanced) {
        advanced = true;
        await db
          .update(taskTopics)
          .set({ executionEpoch: binding.executionEpoch + 1 })
          .where(eq(taskTopics.topicId, binding.topicId));
      }
      return read();
    };
    // Takeover denied: the dispatch already settled `succeeded`, so the
    // derived label is 'backlog' — the retired column can no longer report
    // 'running' for a finished run.
    expect(await new CanonicalVerifyCompletion(db).reconcile(binding, mapped)).toMatchObject({
      state: 'observed',
      taskStatus: 'backlog',
      completed: false,
    });
  }, 30_000);

  it.each([false, true])(
    'capped recurring completion uses the atomic Core guard (revoked=%s)',
    async (revoked) => {
      const mapped = await acceptedEvidence();
      await db
        .update(taskTopics)
        .set({ status: 'completed', trigger: 'schedule' })
        .where(eq(taskTopics.topicId, binding.topicId));
      await db
        .update(tasks)
        .set({
          automationMode: 'schedule',
          config: { schedule: { maxExecutions: 1 } },
          context: {
            scheduler: {
              scheduleStartedAt: new Date(0).toISOString(),
              tickToken: 'tick-1',
            },
          },
          runReservationId: `completion:${binding.operationId}:test`,
          runReservationExpiresAt: new Date(Date.now() + 60_000),
        })
        .where(eq(tasks.id, fixtureTaskId(binding)));
      if (revoked)
        await db
          .update(executionGrants)
          .set({ status: 'revoked' })
          .where(eq(executionGrants.id, binding.grantId));
      const result = await new CanonicalVerifyCompletion(db).reconcile(binding, mapped);
      expect(result).toMatchObject({
        state: 'observed',
        taskStatus: revoked ? 'scheduled' : 'completed',
        completed: !revoked,
      });
    },
    30_000,
  );
});
