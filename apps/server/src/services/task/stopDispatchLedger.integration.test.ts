// @vitest-environment node
import { getTestDB } from '@orvilo/database/test-utils';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import {
  agentOperations,
  taskDispatches,
  tasks,
  taskTopics,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import {
  cleanupTestUser,
  createTestUser,
} from '@/server/routers/lambda/__tests__/integration/setup';
import type { CanonicalRunBinding } from '@/server/services/controlPlane/canonicalRun';
import {
  createCanonicalRunFixture,
  fixtureTaskId,
} from '@/server/services/controlPlane/canonicalRun.test-utils';

import { TaskService } from './index';

const { interrupt } = vi.hoisted(() => ({ interrupt: vi.fn() }));
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: class {
    interruptTask = interrupt;
  },
}));
vi.mock('@/server/services/taskIntegration', () => ({
  TaskIntegrationService: class {
    cleanupTaskWorktrees = vi.fn().mockResolvedValue(true);
  },
}));
vi.mock('@/server/services/taskRunner', () => ({
  TaskRunnerService: class {
    cascadeOnCompletionMany = vi.fn().mockResolvedValue({ paused: [], started: [] });
  },
}));

describe('StopCascade dispatch settlement (db)', () => {
  let db: OrviloDatabase;
  let binding: CanonicalRunBinding;
  let parentId: string;
  let memberId: string | undefined;

  const service = () => new TaskService(db, binding.userId, binding.workspaceId);
  const stop = () =>
    service().updateStatusCascade({ id: parentId, status: 'canceled' }, { userId: binding.userId });
  const dispatch = async () =>
    (await db.select().from(taskDispatches).where(eq(taskDispatches.id, binding.dispatchId)))[0];
  const assertStopped = () =>
    new TaskModel(db, binding.userId, binding.workspaceId).assertStoppedIssueWriters([
      parentId,
      fixtureTaskId(binding),
    ]);

  beforeEach(async () => {
    db = await getTestDB();
    binding = await createCanonicalRunFixture(db);
    const [parent] = await db
      .insert(tasks)
      .values({
        createdByUserId: binding.userId,
        workspaceId: binding.workspaceId,
        identifier: 'STOP-1',
        seq: 2,
        instruction: 'Parent artifact',
        workflowCategory: 'backlog',
      })
      .returning();
    parentId = parent.id;
    await db
      .update(tasks)
      .set({ parentTaskId: parentId, workflowCategory: 'in_progress' })
      .where(eq(tasks.id, fixtureTaskId(binding)));
    await db.insert(agentOperations).values({
      id: binding.operationId,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      taskId: fixtureTaskId(binding),
      topicId: binding.topicId,
      status: 'running',
    });
    interrupt.mockReset().mockImplementation(async () => {
      await db
        .update(agentOperations)
        .set({ status: 'interrupted', metadata: { remoteCancel: { state: 'confirmed' } } })
        .where(eq(agentOperations.id, binding.operationId));
      return { success: true, cancelState: 'confirmed', deviceCancellationConfirmed: true };
    });
  });

  afterEach(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, binding.workspaceId));
    await cleanupTestUser(db, binding.userId);
    if (memberId) await cleanupTestUser(db, memberId);
    memberId = undefined;
    vi.restoreAllMocks();
  });

  it('releases the real replan guard after an acknowledged family cancellation', async () => {
    await expect(assertStopped()).rejects.toThrow('Stop the affected active runs');
    const [unrelated] = await db
      .insert(tasks)
      .values({
        createdByUserId: binding.userId,
        workspaceId: binding.workspaceId,
        identifier: 'OTHER-1',
        seq: 3,
        instruction: 'Unrelated execution',
      })
      .returning();
    const originalDispatch = await dispatch();
    await db.insert(taskDispatches).values({
      id: `outside-${binding.dispatchId}`,
      taskId: unrelated.id,
      workspaceId: binding.workspaceId,
      generation: 1,
      phase: 'running',
      fence: 0,
      taskRevision: unrelated.domainRevision,
      requirementRevision: unrelated.requirementRevision,
      policyRevision: unrelated.policyRevision,
      requestedBy: originalDispatch.requestedBy,
      idempotencyKey: `outside-${binding.dispatchId}`,
    });
    await stop();
    expect((await dispatch()).phase).toBe('canceled');
    await expect(assertStopped()).resolves.toBeUndefined();
    expect(
      (await db.select().from(taskDispatches).where(eq(taskDispatches.taskId, unrelated.id)))[0]
        .phase,
    ).toBe('running');
  });

  it('reconciles an already canceled descendant whose acknowledged dispatch is still running', async () => {
    await db
      .update(tasks)
      .set({ workflowCategory: 'canceled' })
      .where(sql`${tasks.id} IN (${parentId}, ${fixtureTaskId(binding)})`);
    await db
      .update(taskTopics)
      .set({ status: 'canceled' })
      .where(eq(taskTopics.dispatchId, binding.dispatchId));
    await db
      .update(agentOperations)
      .set({ status: 'interrupted', metadata: { remoteCancel: { state: 'confirmed' } } })
      .where(eq(agentOperations.id, binding.operationId));
    await stop();
    expect((await dispatch()).phase).toBe('canceled');
    await expect(assertStopped()).resolves.toBeUndefined();
  });

  it('allows ordinary cancellation after a post-ACK completion transaction rejects', async () => {
    await db
      .update(tasks)
      .set({
        context: {
          issuePlan: {
            confirmedAt: new Date().toISOString(),
            parentTaskId: parentId,
            revision: 1,
            checklists: [],
          },
        },
      })
      .where(eq(tasks.id, parentId));
    await expect(
      service().updateStatusCascade({ id: parentId, status: 'completed' }),
    ).rejects.toThrow('Accept the current confirmed delivery');
    await expect(stop()).resolves.toMatchObject({ task: { workflowCategory: 'canceled' } });
    await expect(assertStopped()).resolves.toBeUndefined();
  });

  it('preserves workspace stop authority for another member historical private topic', async () => {
    memberId = await createTestUser(db);
    await db
      .insert(workspaceMembers)
      .values({ userId: memberId, workspaceId: binding.workspaceId, role: 'member' });
    await db
      .update(taskTopics)
      .set({ visibility: 'private' })
      .where(eq(taskTopics.dispatchId, binding.dispatchId));
    await new TaskService(db, memberId, binding.workspaceId).updateStatusCascade(
      { id: parentId, status: 'canceled' },
      { userId: memberId },
    );
    expect((await dispatch()).phase).toBe('canceled');
    await expect(assertStopped()).resolves.toBeUndefined();
  });

  it.each(['unknown', 'requested'])(
    'keeps a %s device cancellation fenced and guarded',
    async (state) => {
      interrupt.mockResolvedValueOnce({ success: true, cancelState: state });
      await expect(stop()).rejects.toThrow('Task interruption was not confirmed');
      expect((await dispatch()).phase).toBe('cancel_requested');
      expect(
        (await db.select().from(tasks).where(eq(tasks.id, parentId)))[0].workflowCategory,
      ).toBe('backlog');
      await expect(assertStopped()).rejects.toThrow('Stop the affected active runs');
    },
  );

  it('does not settle a dispatch whose fence changed during the device acknowledgment', async () => {
    interrupt.mockImplementationOnce(async () => {
      await db
        .update(taskDispatches)
        .set({ fence: sql`${taskDispatches.fence} + 1` })
        .where(eq(taskDispatches.id, binding.dispatchId));
      return { success: true, cancelState: 'confirmed' };
    });
    await expect(stop()).rejects.toThrow('dispatch');
    expect((await dispatch()).phase).toBe('cancel_requested');
    await expect(assertStopped()).rejects.toThrow('Stop the affected active runs');
  });

  it('does not mark a family canceled when its active dispatch has no operation identity', async () => {
    await db
      .update(taskDispatches)
      .set({ operationId: null })
      .where(eq(taskDispatches.id, binding.dispatchId));
    await expect(stop()).rejects.toThrow('operation identity');
    expect((await dispatch()).phase).toBe('running');
    expect(interrupt).not.toHaveBeenCalled();
  });
});
