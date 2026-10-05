// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import type { AgentOperationStatus } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { agentOperations, taskDispatches, workspaces } from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { cleanupTestUser } from '@/server/routers/lambda/__tests__/integration/setup';
import type { CanonicalRunBinding } from '@/server/services/controlPlane/canonicalRun';
import {
  createCanonicalRunFixture,
  fixtureTaskId,
} from '@/server/services/controlPlane/canonicalRun.test-utils';

import { processTaskDispatchRecovery } from './index';

/**
 * Orphan-slot reproduction: a `task_dispatches` row in `dispatched`/`running`
 * holds the task's single active-dispatch slot while the execution behind it
 * is provably dead. Recovery must key on the execution's truth — a live-looking
 * lease (or a parked op status) must not exempt the row.
 */
describe('task dispatch recovery (db)', () => {
  let db: OrviloDatabase;
  let binding: CanonicalRunBinding;

  const expired = new Date(Date.now() - 60_000);
  const staleOperationAt = new Date(Date.now() - 60 * 60 * 1000);

  const readDispatch = async () => {
    const [row] = await db
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.id, binding.dispatchId))
      .limit(1);
    return row;
  };

  const insertOperation = async (
    status: AgentOperationStatus,
    overrides: Record<string, unknown> = {},
  ) =>
    db.insert(agentOperations).values({
      appContext: {
        dispatchFence: binding.dispatchFence,
        dispatchId: binding.dispatchId,
        executionGeneration: binding.generation,
      },
      id: binding.operationId,
      status,
      taskId: fixtureTaskId(binding),
      topicId: binding.topicId,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      ...overrides,
    });

  const insertChildOperation = async (
    status: AgentOperationStatus,
    overrides: Record<string, unknown> = {},
  ) =>
    db.insert(agentOperations).values({
      id: `child-${binding.operationId}`,
      parentOperationId: binding.operationId,
      status,
      taskId: fixtureTaskId(binding),
      topicId: binding.topicId,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      ...overrides,
    });

  const run = () =>
    processTaskDispatchRecovery({
      db,
      dispatchId: binding.dispatchId,
      workspaceId: binding.workspaceId,
    });

  beforeEach(async () => {
    db = await getTestDB();
    binding = await createCanonicalRunFixture(db);
  });

  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
    await cleanupTestUser(db, binding.userId);
  });

  it('settles a dispatched row whose operation is already terminal', async () => {
    await insertOperation('done');
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: expired, phase: 'dispatched' })
      .where(eq(taskDispatches.id, binding.dispatchId));

    await expect(run()).resolves.toEqual({
      dispatchId: binding.dispatchId,
      operationId: binding.operationId,
      outcome: 'settled',
    });
    expect((await readDispatch()).phase).toBe('succeeded');
  });

  it('counts a missing operation toward the bounded reconcile path', async () => {
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: expired })
      .where(eq(taskDispatches.id, binding.dispatchId));

    await expect(run()).resolves.toMatchObject({
      outcome: 'retry',
      reason: expect.stringContaining('operation_missing'),
    });
    expect((await readDispatch()).recoveryAttempts).toBe(1);
  });

  it('does not re-arm an orphaned async-tool wait that has no live producer', async () => {
    // The parked parent has no live child op and no liveness writer — every
    // sweep restoring 'running' would re-arm the lease and reset the attempt
    // bound forever, pinning the task's dispatch slot behind a dead wait.
    await insertOperation('waiting_for_async_tool', { updatedAt: staleOperationAt });
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: expired })
      .where(eq(taskDispatches.id, binding.dispatchId));

    await expect(run()).resolves.toMatchObject({
      outcome: 'retry',
      reason: 'operation_orphaned_wait:waiting_for_async_tool',
    });
    expect((await readDispatch()).recoveryAttempts).toBe(1);
  });

  it('keeps restoring an async-tool wait whose child operation is still live', async () => {
    await insertOperation('waiting_for_async_tool', { updatedAt: staleOperationAt });
    await insertChildOperation('running');
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: expired })
      .where(eq(taskDispatches.id, binding.dispatchId));

    await expect(run()).resolves.toEqual({
      dispatchId: binding.dispatchId,
      operationId: binding.operationId,
      outcome: 'active',
    });
    expect((await readDispatch()).phase).toBe('running');
  });

  it('gives a freshly parked async-tool wait grace for its resume bridge', async () => {
    await insertOperation('waiting_for_async_tool', { updatedAt: new Date() });
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: expired })
      .where(eq(taskDispatches.id, binding.dispatchId));

    await expect(run()).resolves.toEqual({
      dispatchId: binding.dispatchId,
      operationId: binding.operationId,
      outcome: 'active',
    });
  });

  it('restores a genuinely live run touched by a real producer', async () => {
    await insertOperation('running', { updatedAt: new Date() });
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: expired })
      .where(eq(taskDispatches.id, binding.dispatchId));

    await expect(run()).resolves.toEqual({
      dispatchId: binding.dispatchId,
      operationId: binding.operationId,
      outcome: 'active',
    });
    expect((await readDispatch()).recoveryAttempts).toBe(0);
  });
});
