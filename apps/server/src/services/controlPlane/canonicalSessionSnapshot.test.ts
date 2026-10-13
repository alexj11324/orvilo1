// @vitest-environment node
import type { DurableReceipt } from '@orvilo/agent-execution';
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tasks, workspaces } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import type { CanonicalRunBinding } from './canonicalRun';
import { createCanonicalRunFixture, fixtureTaskId } from './canonicalRun.test-utils';
import {
  CanonicalSessionSnapshots,
  CORE_SESSION_SNAPSHOT_CANDIDATE_SQL,
} from './canonicalSessionSnapshot';

describe('canonical Issue session snapshots', () => {
  let db: OrviloDatabase;
  let binding: CanonicalRunBinding;
  let receipt: DurableReceipt;
  beforeEach(async () => {
    db = await getTestDB();
    binding = await createCanonicalRunFixture(db);
    await db.execute(sql.raw(CORE_SESSION_SNAPSHOT_CANDIDATE_SQL));
    receipt = {
      schemaVersion: 1,
      id: 'receipt',
      requestDigest: 'digest',
      idempotencyKey: 'key',
      commitmentId: 'commitment',
      actionKind: 'file.write',
      status: 'prepared',
      createdAt: 1,
      updatedAt: 1,
      evidence: [],
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
  });
  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
    await cleanupTestUser(db, binding.userId);
  });
  const evidence = () => ({
    commitments: [
      {
        id: 'commitment',
        taskId: fixtureTaskId(binding),
        actionKinds: ['file.write' as const],
        postconditions: [{ verifierId: 'file.sha256', expected: 'hash' }],
      },
    ],
    loadReceipts: async () => [receipt],
  });

  it.each(['description', 'reviewer', 'review', 'workflow'] as const)(
    'captures pending receipts and invalidates recovery after Issue %s changes',
    async (change) => {
      const snapshots = new CanonicalSessionSnapshots(db);
      const captured = await snapshots.capture(binding, evidence());
      expect(captured).toMatchObject({
        ok: true,
        value: {
          authority: {
            issue: { instruction: 'test', reviewerAgentId: null, review: null },
            receipts: [{ id: receipt.id, status: 'prepared' }],
          },
        },
      });
      if (!captured.ok) throw new Error(captured.error.message);
      expect(await snapshots.recover(binding, captured.value.id, evidence())).toMatchObject({
        ok: true,
      });
      const [issue] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, fixtureTaskId(binding)));
      await db
        .update(tasks)
        .set(
          change === 'description'
            ? { instruction: 'changed description' }
            : change === 'reviewer'
              ? { reviewerAgentId: issue.assigneeAgentId }
              : change === 'workflow'
                ? { workflowCategory: 'done' }
                : {
                    config: {
                      issueReview: {
                        cycleId: 'cycle',
                        reviewerAgentId: issue.assigneeAgentId,
                        state: 'submitted',
                        consecutiveFailures: 0,
                      },
                    },
                  },
        )
        .where(eq(tasks.id, fixtureTaskId(binding)));
      expect(await snapshots.recover(binding, captured.value.id, evidence())).toMatchObject({
        ok: false,
      });
    },
  );

  it('rejects foreign receipts and receipt changes during observation', async () => {
    const snapshots = new CanonicalSessionSnapshots(db);
    const foreign = { ...receipt, fence: { ...receipt.fence, tenantId: 'foreign' } };
    expect(
      await snapshots.capture(binding, { ...evidence(), loadReceipts: async () => [foreign] }),
    ).toMatchObject({ ok: false });
    let reads = 0;
    expect(
      await snapshots.capture(binding, {
        ...evidence(),
        loadReceipts: async () => [{ ...receipt, updatedAt: ++reads }],
      }),
    ).toMatchObject({ ok: false });
  });
});
