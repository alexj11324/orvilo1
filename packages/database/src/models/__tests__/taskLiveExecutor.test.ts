// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agentOperations,
  agents,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
} from '../../schemas';
import { TaskModel } from '../task';
import { WorkQueryModel } from '../workQuery';

const db = await getTestDB();
const userId = 'task-live-executor-user';
const agentId = 'task-live-executor-agent';
const model = new TaskModel(db, userId);
const cleanup = async () => {
  await db.delete(agentOperations).where(eq(agentOperations.userId, userId));
  await db.delete(tasks).where(eq(tasks.createdByUserId, userId));
  await db.delete(topics).where(eq(topics.userId, userId));
  await db.delete(agents).where(eq(agents.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
};
beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(agents).values({ id: agentId, slug: agentId, userId });
});
afterEach(cleanup);
const create = () =>
  model.create({ assigneeAgentId: agentId, assigneeUserId: userId, instruction: 'Execute' });

// Relational test fixtures verify admission, not real-Agent acceptance.
const correlate = async (taskId: string) => {
  const topicId = `topic_${taskId}`,
    dispatchId = `dispatch_${taskId}`,
    operationId = `operation_${taskId}`;
  await db.insert(topics).values({ id: topicId, userId, agentId });
  await db.insert(taskDispatches).values({
    id: dispatchId,
    taskId,
    agentId,
    generation: 1,
    fence: 1,
    phase: 'running',
    operationId,
    taskRevision: 1,
    requirementRevision: 1,
    policyRevision: 1,
    idempotencyKey: dispatchId,
    requestedBy: `manual:${userId}`,
  });
  await db.insert(taskTopics).values({
    taskId,
    topicId,
    userId,
    seq: 1,
    operationId,
    dispatchId,
    executionGeneration: 1,
    dispatchFence: 1,
    runState: 'running',
  });
  await db.insert(agentOperations).values({
    id: operationId,
    taskId,
    topicId,
    agentId,
    userId,
    status: 'running',
    appContext: { dispatchId, dispatchFence: 1, executionGeneration: 1 },
  });
  await db
    .update(tasks)
    .set({ currentTopicId: topicId, executionGeneration: 1 })
    .where(eq(tasks.id, taskId));
  return { topicId, dispatchId, operationId };
};
const rejectsGate = async (write: Promise<unknown>) => {
  try {
    await write;
    throw new Error('Write unexpectedly succeeded');
  } catch (error) {
    const chain = [error, (error as { cause?: unknown }).cause];
    expect(chain.some((item) => (item as { code?: string })?.code === '23514')).toBe(true);
    expect(
      chain.some(
        (item) =>
          (item as { constraint?: string })?.constraint ===
          'tasks_active_workflow_requires_live_executor',
      ),
    ).toBe(true);
  }
};
const enter = (id: string, workflowCategory: 'in_progress' | 'in_review' | 'todo') =>
  db.update(tasks).set({ workflowCategory }).where(eq(tasks.id, id));

describe('database active workflow entry', () => {
  it.each(['in_progress', 'in_review'] as const)(
    'rejects direct INSERT into %s without a real execution',
    async (workflowCategory) => {
      await rejectsGate(
        db.insert(tasks).values({
          id: 'direct-active',
          identifier: 'LIVE-1',
          seq: 1,
          instruction: 'No operation',
          createdByUserId: userId,
          assigneeUserId: userId,
          assigneeAgentId: agentId,
          workflowCategory,
        }),
      );
    },
  );
  it('rejects missing assignment, dispatch-only and pre-spawn operation flags', async () => {
    const unassigned = await model.create({ instruction: 'Unassigned' });
    await rejectsGate(enter(unassigned.id, 'in_progress'));
    const task = await create();
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_review'));
    const run = await correlate(task.id);
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_progress'));
    await db
      .update(agentOperations)
      .set({ metadata: { remoteAdmission: { state: 'acknowledged' } } })
      .where(eq(agentOperations.id, run.operationId));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_progress'));
    await rejectsGate(
      db.execute(sql`UPDATE tasks SET workflow_category = 'in_review' WHERE id = ${task.id}`),
    );
  });
  it('shares producer correlation for entry/readers and rejects terminal or mismatched execution', async () => {
    const task = await create(),
      run = await correlate(task.id);
    await db
      .update(topics)
      .set({
        metadata: {
          heteroCurrentMsgId: { operationId: run.operationId, msgId: 'producer-message' },
        },
      })
      .where(eq(topics.id, run.topicId));
    expect(await model.hasLiveExecutor(task.id, run.operationId)).toBe(true);
    expect(await model.hasLiveExecutor(task.id, 'wrong-operation')).toBe(false);
    await enter(task.id, 'in_progress');
    expect((await model.findById(task.id))?.hasLiveExecutor).toBe(true);
    expect((await model.list()).tasks.find((row) => row.id === task.id)?.hasLiveExecutor).toBe(
      true,
    );
    const rows = await new WorkQueryModel(db, userId).queryTasks({
      query: { entityType: 'task', schemaVersion: 1, groupBy: 'none', layout: 'list' },
    });
    expect(rows.tasks.find((row) => row.id === task.id)?.hasLiveExecutor).toBe(true);
    await enter(task.id, 'in_review');
    await rejectsGate(db.update(tasks).set({ assigneeUserId: null }).where(eq(tasks.id, task.id)));
    await rejectsGate(db.update(tasks).set({ assigneeAgentId: null }).where(eq(tasks.id, task.id)));
    await db
      .update(agentOperations)
      .set({ status: 'done', completedAt: new Date() })
      .where(eq(agentOperations.id, run.operationId));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await db
      .update(tasks)
      .set({ name: 'Historical unrelated edit allowed' })
      .where(eq(tasks.id, task.id));
    await enter(task.id, 'todo');
    await rejectsGate(enter(task.id, 'in_review'));
    await db
      .update(agentOperations)
      .set({
        status: 'running',
        completedAt: null,
        appContext: { dispatchId: run.dispatchId, executionGeneration: 2, dispatchFence: 1 },
      })
      .where(eq(agentOperations.id, run.operationId));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_progress'));
  });
  it('rejects mismatched dispatch operation/fence and nonexecuting waiting or parked state', async () => {
    const task = await create(),
      run = await correlate(task.id);
    await db
      .update(topics)
      .set({
        metadata: {
          heteroCurrentMsgId: { operationId: run.operationId, msgId: 'producer-message' },
        },
      })
      .where(eq(topics.id, run.topicId));
    await db
      .update(taskDispatches)
      .set({ operationId: 'different-operation' })
      .where(eq(taskDispatches.id, run.dispatchId));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_progress'));
    await db
      .update(taskDispatches)
      .set({ operationId: run.operationId, fence: 2 })
      .where(eq(taskDispatches.id, run.dispatchId));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_review'));
    await db.update(taskDispatches).set({ fence: 1 }).where(eq(taskDispatches.id, run.dispatchId));
    await db
      .update(agentOperations)
      .set({ status: 'waiting_for_human' })
      .where(eq(agentOperations.id, run.operationId));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_progress'));
    await db
      .update(agentOperations)
      .set({ status: 'running' })
      .where(eq(agentOperations.id, run.operationId));
    await model.updateStatus(task.id, 'paused');
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
  });

  it('preserves explicit review attention in every status write without a fake active entry', async () => {
    const task = await create();
    const updated = await model.updateStatus(task.id, 'paused', {
      parkedReason: 'review_required',
    });
    expect(updated?.context).toMatchObject({
      execution: { parked: { reason: 'review_required' } },
    });
    expect(updated?.workflowCategory).toBe('backlog');
    await model.updateStatusIfCurrent(task.id, 'paused', 'paused', {
      parkedReason: 'needs_changes',
    });
    expect((await model.findById(task.id))?.context).toMatchObject({
      execution: { parked: { reason: 'needs_changes' } },
    });
    await model.updateStatusForExecutionContract(
      task.id,
      'paused',
      {
        assigneeAgentId: agentId,
        executionGeneration: 0,
        policyRevision: 1,
        requirementRevision: 1,
      },
      { parkedReason: 'blocked' },
    );
    expect((await model.findById(task.id))?.context).toMatchObject({
      execution: { parked: { reason: 'blocked' } },
    });
  });

  it('requires both slots and the same Agent for remote producer admission', async () => {
    const task = await create(),
      run = await correlate(task.id);
    await db
      .update(agentOperations)
      .set({ metadata: { remoteAdmission: { state: 'running' } } })
      .where(eq(agentOperations.id, run.operationId));
    expect(await model.hasLiveExecutor(task.id)).toBe(true);
    await db.update(tasks).set({ assigneeUserId: null }).where(eq(tasks.id, task.id));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_progress'));
    await db.update(tasks).set({ assigneeUserId: userId }).where(eq(tasks.id, task.id));
    await db
      .update(agentOperations)
      .set({ agentId: null })
      .where(eq(agentOperations.id, run.operationId));
    expect(await model.hasLiveExecutor(task.id)).toBe(false);
    await rejectsGate(enter(task.id, 'in_review'));
  });
});
