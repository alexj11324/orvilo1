// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { TaskHandoffRequiredError, TaskModel } from '../task';
import { TaskDispatchModel } from '../taskDispatch';

const db: OrviloDatabase = await getTestDB();
const userId = 'task-ownership-user';
const workspaceId = 'task-ownership-workspace';

const cleanup = async () => {
  await db.delete(taskTopics);
  await db.delete(taskDispatches);
  await db.delete(topics).where(eq(topics.userId, userId));
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.createdByUserId, userId));
  await db.delete(agents).where(eq(agents.userId, userId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: userId }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Task Ownership Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
  await db.insert(agents).values([
    { id: 'agent-a', slug: 'agent-a', userId, workspaceId },
    { id: 'agent-b', slug: 'agent-b', userId, workspaceId },
  ]);
});

afterEach(cleanup);

const createTask = async (
  identifier: string,
  seq: number,
  overrides: Partial<typeof tasks.$inferInsert> = {},
) => {
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: userId,
      identifier,
      instruction: `Run ${identifier}`,
      seq,
      workspaceId,
      ...overrides,
    })
    .returning();
  return task;
};

const createRunningDispatch = async (taskId: string, seq: number, agentId = 'agent-a') => {
  const model = new TaskDispatchModel(db, workspaceId);
  const requested = await model.request({
    idempotencyKey: `manual:RUN-${seq}:request-1`,
    requestedBy: userId,
    taskId,
    trigger: 'manual',
  });
  if (requested.state === 'busy') throw new Error('unexpected busy');
  const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
  const running = await model.transition({
    dispatchId: requested.dispatch.id,
    expected: ['claimed'],
    fence: claim!.fence,
    operationId: `operation-${seq}`,
    owner: 'worker-a',
    phase: 'running',
  });
  await db.update(taskDispatches).set({ agentId }).where(eq(taskDispatches.id, running!.id));
  return { dispatch: running!, model };
};

describe('running-task assignee guard', () => {
  it('rejects an assignee change on a running task outside a transfer protocol', async () => {
    const taskModel = new TaskModel(db, userId, workspaceId);
    const task = await createTask('OWN-1', 101, {
      assigneeAgentId: 'agent-a',
      status: 'running',
    });

    await expect(
      taskModel.updateWithLog(task.id, { assigneeAgentId: 'agent-b' }, { userId }),
    ).rejects.toBeInstanceOf(TaskHandoffRequiredError);
    await expect(
      taskModel.updateWithLog(task.id, { assigneeAgentId: null }, { userId }),
    ).rejects.toBeInstanceOf(TaskHandoffRequiredError);

    const unchanged = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(unchanged[0]).toMatchObject({ assigneeAgentId: 'agent-a', status: 'running' });
  });

  it('still permits assignee edits on non-running tasks and transfer-marked writes', async () => {
    const taskModel = new TaskModel(db, userId, workspaceId);
    const idle = await createTask('OWN-2', 102, { assigneeAgentId: 'agent-a' });
    await expect(
      taskModel.updateWithLog(idle.id, { assigneeAgentId: 'agent-b' }, { userId }),
    ).resolves.toMatchObject({ assigneeAgentId: 'agent-b' });

    const running = await createTask('OWN-3', 103, {
      assigneeAgentId: 'agent-a',
      status: 'running',
    });
    // Re-saving the same assignee is not a transfer and stays allowed.
    await expect(
      taskModel.updateWithLog(running.id, { assigneeAgentId: 'agent-a' }, { userId }),
    ).resolves.toMatchObject({ assigneeAgentId: 'agent-a' });
    await expect(
      taskModel.updateWithLog(
        running.id,
        { assigneeAgentId: 'agent-b' },
        { userId },
        { executionTransfer: true },
      ),
    ).resolves.toMatchObject({ assigneeAgentId: 'agent-b', status: 'running' });
  });

  it('enforces expectedDomainRevision CAS on the assignee write', async () => {
    const taskModel = new TaskModel(db, userId, workspaceId);
    const task = await createTask('OWN-4', 104, { assigneeAgentId: 'agent-a' });

    await expect(
      taskModel.updateWithLog(
        task.id,
        { assigneeAgentId: 'agent-b' },
        { userId },
        {
          expectedDomainRevision: task.domainRevision + 99,
        },
      ),
    ).rejects.toMatchObject({ code: 'TASK_REVISION_CONFLICT' });

    await expect(
      taskModel.updateWithLog(
        task.id,
        { assigneeAgentId: 'agent-b' },
        { userId },
        {
          expectedDomainRevision: task.domainRevision,
        },
      ),
    ).resolves.toMatchObject({ assigneeAgentId: 'agent-b' });
  });
});

describe('bounded cancellation', () => {
  it('stamps the cancel window on requestStop and counts each claim', async () => {
    const task = await createTask('OWN-5', 105, { status: 'running' });
    const { dispatch, model } = await createRunningDispatch(task.id, 105);

    const stopping = await model.requestStop({
      dispatchId: dispatch.id,
      fence: dispatch.fence,
      generation: dispatch.generation,
      operationId: 'operation-105',
      reason: 'user_cancel',
    });
    expect(stopping).toMatchObject({
      cancelAttempts: 0,
      phase: 'cancel_requested',
    });
    expect(stopping!.cancelRequestedAt).not.toBeNull();

    const firstClaim = await model.claimCancellation(dispatch.id, 'worker-1', 1);
    expect(firstClaim?.dispatch.cancelAttempts).toBe(1);

    await model.retryCancellation({
      dispatchId: dispatch.id,
      fence: firstClaim!.fence,
      owner: 'worker-1',
      reason: 'cancel_retry:temporary gateway failure',
      retryAfterMs: 1,
    });
    // Force the backoff lease to expire so the second worker can claim.
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(taskDispatches.id, dispatch.id));
    const retryClaim = await model.claimCancellation(dispatch.id, 'worker-2', 60_000);
    expect(retryClaim?.dispatch.cancelAttempts).toBe(2);
    expect(retryClaim?.dispatch.lastCancelError).toContain('temporary gateway failure');
  });

  it('abandons a cancel_requested dispatch and parks its running task', async () => {
    const task = await createTask('OWN-6', 106, { status: 'running' });
    const { dispatch, model } = await createRunningDispatch(task.id, 106);
    await db.insert(topics).values({ id: 'topic-own-6', userId });
    await db.insert(taskTopics).values({
      dispatchId: dispatch.id,
      executionGeneration: dispatch.generation,
      runState: 'running',
      seq: 1,
      status: 'running',
      taskId: task.id,
      topicId: 'topic-own-6',
      userId,
      workspaceId,
    });

    const stopping = await model.requestStop({
      dispatchId: dispatch.id,
      fence: dispatch.fence,
      generation: dispatch.generation,
      reason: 'user_cancel',
    });
    const claim = await model.claimCancellation(dispatch.id, 'worker-1', 60_000);
    expect(claim?.fence).toBe(stopping!.fence);

    const abandoned = await model.abandonCancellation({
      dispatchId: dispatch.id,
      fence: claim!.fence,
      generation: dispatch.generation,
      owner: 'worker-1',
      reason: 'Cancellation never confirmed; execution needs attention.',
    });
    expect(abandoned?.dispatch.phase).toBe('abandoned');

    await expect(db.select().from(tasks).where(eq(tasks.id, task.id))).resolves.toMatchObject([
      { status: 'paused' },
    ]);
    await expect(
      db.select().from(taskTopics).where(eq(taskTopics.dispatchId, dispatch.id)),
    ).resolves.toMatchObject([{ runState: 'canceled', status: 'abandoned' }]);
    await expect(
      db.select().from(topics).where(eq(topics.id, 'topic-own-6')),
    ).resolves.toMatchObject([{ completedAt: expect.any(Date) }]);

    // The active-dispatch slot is released: a successor dispatch inserts cleanly.
    const successor = await model.request({
      idempotencyKey: 'manual:OWN-6:request-2',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    expect(successor.state).toBe('created');
  });
});

describe('execution-ownership scanners', () => {
  it('findActiveByTaskId returns the live dispatch and skips terminal rows', async () => {
    const task = await createTask('OWN-7', 107, { status: 'running' });
    const model = new TaskDispatchModel(db, workspaceId);
    await expect(model.findActiveByTaskId(task.id)).resolves.toBeUndefined();

    const { dispatch } = await createRunningDispatch(task.id, 107);
    await expect(model.findActiveByTaskId(task.id)).resolves.toMatchObject({
      id: dispatch.id,
      phase: 'running',
    });
  });

  it('requestStopForTasks fences every active dispatch behind the given tasks', async () => {
    const first = await createTask('OWN-8', 108, { status: 'running' });
    const second = await createTask('OWN-9', 109, { status: 'running' });
    const settledTask = await createTask('OWN-10', 110, { status: 'completed' });
    const firstRun = await createRunningDispatch(first.id, 108);
    const secondRun = await createRunningDispatch(second.id, 109);
    await db.insert(taskDispatches).values({
      agentId: 'agent-a',
      generation: 1,
      id: 'dispatch-own-10',
      idempotencyKey: 'manual:OWN-10:settled',
      phase: 'succeeded',
      policyRevision: 1,
      requestedBy: `user:${userId}`,
      requirementRevision: 1,
      taskId: settledTask.id,
      taskRevision: 1,
      workspaceId,
    });

    const fenced = await TaskDispatchModel.requestStopForTasks(
      db,
      [first.id, second.id, settledTask.id],
      'agent_owner_transfer',
    );
    expect(fenced).toBe(2);

    for (const dispatch of [firstRun.dispatch, secondRun.dispatch]) {
      await expect(
        db.select().from(taskDispatches).where(eq(taskDispatches.id, dispatch.id)),
      ).resolves.toMatchObject([
        {
          cancelAttempts: 0,
          fence: dispatch.fence + 1,
          leaseOwner: null,
          phase: 'cancel_requested',
          waitingReason: 'agent_owner_transfer',
        },
      ]);
    }
    await expect(
      db.select().from(taskDispatches).where(eq(taskDispatches.taskId, settledTask.id)),
    ).resolves.toMatchObject([{ phase: 'succeeded' }]);
  });
});
