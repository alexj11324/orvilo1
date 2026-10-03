// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskExecutionControlModel } from '@/database/models/taskExecutionControl';
import { TaskTopicModel } from '@/database/models/taskTopic';
import {
  executionGrants,
  taskDispatches,
  tasks,
  taskTopics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';
import { AgentDelegationService } from '@/server/services/agentDelegation/executionGrants';

import { CanonicalRunAuthority, type CanonicalRunBinding } from './canonicalRun';
import { createCanonicalRunFixture, fixtureTaskId } from './canonicalRun.test-utils';

// Real canonical schema and grant service. No mock authority or SQL query replacements.
describe('canonical bounded run admission', () => {
  let db: OrviloDatabase;
  let binding: CanonicalRunBinding;
  beforeEach(async () => {
    db = await getTestDB();
    binding = await createCanonicalRunFixture(db);
  });
  afterEach(async () => {
    if (binding) {
      await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
      await cleanupTestUser(db, binding.userId);
    }
  });

  it('loads the canonical separate dispatch fence and run epoch after adapter recreation', async () => {
    const run = () => new CanonicalRunAuthority(db).withRun(binding, async (snapshot) => snapshot);
    const first = await run();
    expect(first).toMatchObject({
      ok: true,
      value: {
        fence: { epoch: 1, leaseId: binding.runtimeLeaseId, taskId: fixtureTaskId(binding) },
      },
    });
    expect(await run()).toEqual(first);
  });

  it.each(['workspace', 'operation', 'epoch', 'fence', 'generation'] as const)(
    'denies mismatched %s without invoking effects',
    async (field) => {
      const changed = { ...binding };
      if (field === 'workspace') changed.workspaceId = 'foreign';
      if (field === 'operation') changed.operationId = 'foreign';
      if (field === 'epoch') changed.executionEpoch++;
      if (field === 'fence') changed.dispatchFence++;
      if (field === 'generation') changed.generation++;
      let called = false;
      expect(
        await new CanonicalRunAuthority(db).withRun(changed, async () => {
          called = true;
        }),
      ).toMatchObject({ ok: false });
      expect(called).toBe(false);
    },
  );

  it.each(['revoked', 'expiredLease', 'unleased', 'changedPolicy', 'deletedMember'] as const)(
    'denies authoritative %s',
    async (change) => {
      if (change === 'revoked')
        await db
          .update(executionGrants)
          .set({ status: 'revoked' })
          .where(eq(executionGrants.id, binding.grantId));
      if (change === 'expiredLease')
        await db
          .update(taskTopics)
          .set({
            executionControl: sql`jsonb_set(${taskTopics.executionControl}, '{leaseExpiresAt}', '0'::jsonb)`,
          })
          .where(eq(taskTopics.topicId, binding.topicId));
      if (change === 'unleased')
        await db
          .update(taskTopics)
          .set({ executionControl: null })
          .where(eq(taskTopics.topicId, binding.topicId));
      if (change === 'changedPolicy')
        await db
          .update(tasks)
          .set({ policyRevision: binding.policyRevision + 1 })
          .where(eq(tasks.id, fixtureTaskId(binding)));
      if (change === 'deletedMember')
        await db
          .update(workspaceMembers)
          .set({ deletedAt: new Date() })
          .where(eq(workspaceMembers.userId, binding.userId));
      let effects = 0;
      expect(
        await new CanonicalRunAuthority(db).withRun(binding, async () => {
          effects++;
        }),
      ).toMatchObject({ ok: false });
      expect(effects).toBe(0);
    },
  );
  it('uses the live process lease even after the provisioning lease is cleared', async () => {
    await db
      .update(taskDispatches)
      .set({ leaseOwner: null, leaseExpiresAt: null })
      .where(eq(taskDispatches.id, binding.dispatchId));
    expect(
      await new CanonicalRunAuthority(db).withRun(binding, async (snapshot) => snapshot.fence),
    ).toMatchObject({
      ok: true,
      value: { ownerId: binding.runtimeOwnerId, leaseId: binding.runtimeLeaseId },
    });
  });

  it.each(['runtimeRegistrationId', 'runtimeOwnerId', 'runtimeLeaseId'] as const)(
    'denies a foreign %s',
    async (field) => {
      expect(
        await new CanonicalRunAuthority(db).withRun(
          { ...binding, [field]: 'foreign' },
          async () => true,
        ),
      ).toMatchObject({ ok: false });
    },
  );

  it('reserves registering admission for startup and denies action callbacks', async () => {
    await db
      .update(taskTopics)
      .set({
        executionControl: sql`jsonb_set(${taskTopics.executionControl}, '{state}', '"registering"'::jsonb)`,
      })
      .where(eq(taskTopics.topicId, binding.topicId));
    const authority = new CanonicalRunAuthority(db);
    expect(await authority.withRegistration(binding, async () => true)).toMatchObject({ ok: true });
    expect(await authority.withRun(binding, async () => true)).toMatchObject({ ok: false });
  });

  it.skipIf(!process.env.TEST_SERVER_DB)(
    'holds PostgreSQL cancellation behind admitted work, then denies the stale owner',
    async () => {
      let admitted!: () => void;
      let finish!: () => void;
      const entered = new Promise<void>((resolve) => {
        admitted = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const ordering: string[] = [];
      const work = new CanonicalRunAuthority(db).withRun(binding, async () => {
        admitted();
        await hold;
        ordering.push('effect-finished');
      });
      await entered;
      const cancellation = new TaskDispatchModel(db, binding.workspaceId)
        .requestStop({
          dispatchId: binding.dispatchId,
          fence: binding.dispatchFence,
          generation: binding.generation,
          operationId: binding.operationId,
          reason: 'core-test-stop',
        })
        .then((result) => {
          expect(result?.phase).toBe('cancel_requested');
          ordering.push('cancel-committed');
        });
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(ordering).toEqual([]);
      } finally {
        finish();
      }
      expect(await work).toMatchObject({ ok: true });
      await cancellation;
      expect(ordering).toEqual(['effect-finished', 'cancel-committed']);
      let effects = 0;
      expect(
        await new CanonicalRunAuthority(db).withRun(binding, async () => {
          effects++;
        }),
      ).toMatchObject({ ok: false });
      expect(effects).toBe(0);
    },
  );
  it('fences legacy epoch, commit and startRun writers while a handoff holds admission', async () => {
    const model = new TaskExecutionControlModel(db, binding.userId, binding.workspaceId);
    await model.beginHandoff(binding, {
      id: `handoff-${fixtureTaskId(binding)}`,
      successorOwnerId: 'next-owner',
      successorRegistrationId: 'next-registration',
      successorLeaseId: 'next-lease',
      leaseMs: 60_000,
    });
    const grants = new AgentDelegationService(db, binding.userId, binding.workspaceId);
    await expect(
      grants.claimExecutionEpoch({
        grantId: binding.grantId,
        taskId: fixtureTaskId(binding),
        topicId: binding.topicId,
      }),
    ).rejects.toThrow();
    await expect(
      grants.assertMayCommit({
        grantId: binding.grantId,
        taskId: fixtureTaskId(binding),
        topicId: binding.topicId,
        epoch: binding.executionEpoch,
      }),
    ).rejects.toThrow();
    await expect(
      new TaskTopicModel(db, binding.userId, binding.workspaceId).startRun(
        fixtureTaskId(binding),
        binding.topicId,
        {
          operationId: binding.operationId,
          seq: 1,
          dispatch: {
            id: binding.dispatchId,
            fence: binding.dispatchFence,
            generation: binding.generation,
            planRevision: null,
            policyRevision: binding.policyRevision,
            requirementRevision: 0,
            taskRevision: binding.stateRevision,
          },
        },
      ),
    ).rejects.toThrow('Core runtime registration');
    expect((await model.readControl(binding))?.epoch).toBe(binding.executionEpoch);
    expect((await model.readControl(binding))?.control?.state).toBe('held');
  });
});
