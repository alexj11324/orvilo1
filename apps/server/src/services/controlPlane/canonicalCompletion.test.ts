// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  agentOperations,
  executionGrants,
  taskDispatches,
  tasks,
  taskTopics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';

import { CanonicalIssueCompletion } from './canonicalCompletion';
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
  it('does not derive Issue Done from a successful operation', async () => {
    expect(await new CanonicalIssueCompletion(db).reconcile(binding)).toMatchObject({
      state: 'observed',
      completed: false,
    });
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, fixtureTaskId(binding)));
    expect(task.workflowCategory).not.toBe('done');
  });

  it('observes Done only after the Issue status changes', async () => {
    await db
      .update(tasks)
      .set({ workflowCategory: 'done' })
      .where(eq(tasks.id, fixtureTaskId(binding)));
    expect(await new CanonicalIssueCompletion(db).reconcile(binding)).toEqual({
      state: 'observed',
      taskStatus: 'completed',
      completed: true,
    });
  });

  it('rejects foreign operation and superseded dispatch identity', async () => {
    expect(
      await new CanonicalIssueCompletion(db).reconcile({ ...binding, operationId: 'foreign' }),
    ).toEqual({ state: 'denied', reason: 'run_binding_changed' });
    await db
      .update(taskDispatches)
      .set({ fence: binding.dispatchFence + 1 })
      .where(eq(taskDispatches.id, binding.dispatchId));
    expect(await new CanonicalIssueCompletion(db).reconcile(binding)).toEqual({
      state: 'denied',
      reason: 'dispatch_contract_changed',
    });
  });

  it.each(['revoked', 'epoch', 'runtime', 'membership', 'generation', 'deleted'] as const)(
    'denies observation after %s changes',
    async (change) => {
      if (change === 'revoked')
        await db
          .update(executionGrants)
          .set({ status: 'revoked' })
          .where(eq(executionGrants.id, binding.grantId));
      if (change === 'epoch')
        await db
          .update(taskTopics)
          .set({ executionEpoch: binding.executionEpoch + 1 })
          .where(eq(taskTopics.topicId, binding.topicId));
      if (change === 'generation')
        await db
          .update(tasks)
          .set({ executionGeneration: binding.generation + 1 })
          .where(eq(tasks.id, fixtureTaskId(binding)));
      if (change === 'deleted')
        await db
          .update(tasks)
          .set({ isDeleted: true, deletedAt: new Date() })
          .where(eq(tasks.id, fixtureTaskId(binding)));
      if (change === 'membership')
        await db
          .update(workspaceMembers)
          .set({ suspendedAt: new Date() })
          .where(eq(workspaceMembers.userId, binding.userId));
      const result = await new CanonicalIssueCompletion(db).reconcile(
        change === 'runtime' ? { ...binding, runtimeLeaseId: 'foreign' } : binding,
      );
      expect(result.state).toBe('denied');
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, fixtureTaskId(binding)));
      expect(task.workflowCategory).not.toBe('done');
    },
  );
});
