// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, taskDispatches, tasks, users, workspaces } from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import {
  TaskDispatchIdempotencyConflictError,
  TaskDispatchModel,
  TaskDispatchNotFoundError,
} from '../taskDispatch';

const db: LobeChatDatabase = await getTestDB();
const userId = 'task-dispatch-user';
const workspaceId = 'task-dispatch-workspace';
const otherUserId = 'task-dispatch-other-user';
const otherWorkspaceId = 'task-dispatch-other-workspace';

const cleanup = async () => {
  await db.delete(taskDispatches);
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, otherWorkspaceId));
  await db.delete(agents).where(eq(agents.userId, userId));
  await db.delete(agents).where(eq(agents.userId, otherUserId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, otherWorkspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherUserId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await db.insert(workspaces).values([
    {
      id: workspaceId,
      name: 'Task Dispatch Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    },
    {
      id: otherWorkspaceId,
      name: 'Other Task Dispatch Workspace',
      primaryOwnerId: otherUserId,
      slug: otherWorkspaceId,
    },
  ]);
});

afterEach(cleanup);

const createTask = async (identifier: string, seq: number, targetWorkspaceId = workspaceId) => {
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: targetWorkspaceId === workspaceId ? userId : otherUserId,
      identifier,
      instruction: `Run ${identifier}`,
      seq,
      workspaceId: targetWorkspaceId,
    })
    .returning();
  return task;
};

describe('TaskDispatchModel', () => {
  it('allows only one active dispatch claim for a task', async () => {
    const task = await createTask('RUN-1', 1);
    const base = {
      generation: 1,
      idempotencyKey: 'manual:run-1',
      policyRevision: 1,
      requestedBy: `user:${userId}`,
      requirementRevision: 1,
      taskId: task.id,
      taskRevision: 1,
      workspaceId,
    };

    await db.insert(taskDispatches).values({ ...base, id: 'dispatch-1' });
    await expect(
      db.insert(taskDispatches).values({
        ...base,
        id: 'dispatch-2',
        idempotencyKey: 'orchestrator:run-1',
      }),
    ).rejects.toThrow();

    await db
      .update(taskDispatches)
      .set({ phase: 'succeeded' })
      .where(eq(taskDispatches.id, 'dispatch-1'));

    await expect(
      db.insert(taskDispatches).values({
        ...base,
        generation: 2,
        id: 'dispatch-2',
        idempotencyKey: 'orchestrator:run-1',
      }),
    ).resolves.toBeDefined();
  });

  it('returns one stable dispatch for idempotent execution requests', async () => {
    const task = await createTask('RUN-2', 2);
    const model = new TaskDispatchModel(db, workspaceId);

    const first = await model.request({
      idempotencyKey: 'manual:RUN-2:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    const replay = await model.request({
      idempotencyKey: 'manual:RUN-2:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });

    expect(first.state).toBe('created');
    expect(replay.state).toBe('existing');
    if (first.state === 'busy' || replay.state === 'busy') throw new Error('unexpected busy');
    expect(replay.dispatch.id).toBe(first.dispatch.id);

    const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(updatedTask.executionGeneration).toBe(1);
  });

  it('converges concurrent retries on one stable dispatch', async () => {
    const task = await createTask('RUN-2B', 22);
    const model = new TaskDispatchModel(db, workspaceId);
    const request = () =>
      model.request({
        idempotencyKey: 'manual:RUN-2B:request-1',
        requestedBy: userId,
        taskId: task.id,
        trigger: 'manual',
      });

    const [first, second] = await Promise.all([request(), request()]);
    if (first.state === 'busy' || second.state === 'busy') throw new Error('unexpected busy');
    expect(first.dispatch.id).toBe(second.dispatch.id);
    expect(new Set([first.state, second.state])).toEqual(new Set(['created', 'existing']));
  });

  it('rejects reuse of an idempotency key for a different task', async () => {
    const firstTask = await createTask('RUN-2C', 23);
    const secondTask = await createTask('RUN-2D', 24);
    const model = new TaskDispatchModel(db, workspaceId);
    await model.request({
      idempotencyKey: 'manual:shared-request',
      requestedBy: userId,
      taskId: firstTask.id,
      trigger: 'manual',
    });

    await expect(
      model.request({
        idempotencyKey: 'manual:shared-request',
        requestedBy: userId,
        taskId: secondTask.id,
        trigger: 'manual',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchIdempotencyConflictError);
  });

  it('fences an expired dispatch worker before it can write a later phase', async () => {
    const task = await createTask('RUN-3', 3);
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-3:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');

    const firstLease = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 1000);
    expect(firstLease).not.toBeNull();
    await model.transition({
      dispatchId: requested.dispatch.id,
      expected: ['claimed'],
      fence: firstLease!.fence,
      leaseExpiresAt: new Date(0),
      owner: 'worker-a',
      phase: 'provisioning',
    });

    const recovery = await model.claimForRecovery(requested.dispatch.id, 'worker-b', 1000);
    expect(recovery?.fence).toBe(firstLease!.fence + 1);
    const staleWrite = await model.transition({
      dispatchId: requested.dispatch.id,
      expected: ['outcome_unknown'],
      fence: firstLease!.fence,
      owner: 'worker-a',
      phase: 'running',
    });
    expect(staleWrite).toBeNull();
  });

  it('identifies a late completion from an old execution generation', async () => {
    const task = await createTask('RUN-4', 4);
    const model = new TaskDispatchModel(db, workspaceId);
    const first = await model.request({
      idempotencyKey: 'manual:RUN-4:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (first.state === 'busy') throw new Error('unexpected busy');
    await model.settle({
      dispatchId: first.dispatch.id,
      expected: ['requested'],
      fence: first.dispatch.fence,
      generation: first.dispatch.generation,
      phase: 'failed',
    });

    const second = await model.request({
      idempotencyKey: 'manual:RUN-4:request-2',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (second.state === 'busy') throw new Error('unexpected busy');

    const late = await model.settle({
      dispatchId: first.dispatch.id,
      expected: ['requested'],
      fence: first.dispatch.fence,
      generation: first.dispatch.generation,
      phase: 'succeeded',
    });
    expect(late?.currentGeneration).toBe(false);
    expect(late?.state).toBe('already_settled');
    expect(late?.dispatch.phase).toBe('failed');
    expect(second.dispatch.generation).toBe(first.dispatch.generation + 1);
  });

  it('does not expose a dispatch or task from another workspace', async () => {
    const foreignTask = await createTask('RUN-5', 5, otherWorkspaceId);
    const foreignModel = new TaskDispatchModel(db, otherWorkspaceId);
    const requested = await foreignModel.request({
      idempotencyKey: 'manual:RUN-5:request-1',
      requestedBy: otherUserId,
      taskId: foreignTask.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');

    const model = new TaskDispatchModel(db, workspaceId);
    await expect(
      model.request({
        idempotencyKey: 'manual:RUN-5:request-1',
        requestedBy: userId,
        taskId: foreignTask.id,
        trigger: 'manual',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchNotFoundError);
    await expect(model.findById(requested.dispatch.id)).resolves.toBeUndefined();
    await expect(
      model.settle({
        dispatchId: requested.dispatch.id,
        expected: ['requested'],
        fence: requested.dispatch.fence,
        generation: requested.dispatch.generation,
        phase: 'failed',
      }),
    ).resolves.toBeNull();
  });

  it('resumes the same waiting dispatch after an Agent is assigned', async () => {
    const task = await createTask('RUN-6', 6);
    await db.insert(agents).values({ id: 'dispatch-agent-1', userId, workspaceId });
    const model = new TaskDispatchModel(db, workspaceId);
    const first = await model.request({
      idempotencyKey: 'orchestrator:RUN-6:plan-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (first.state === 'busy') throw new Error('unexpected busy');
    await model.markWaiting(first.dispatch.id, 'no_eligible_agent');
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-agent-1' })
      .where(eq(tasks.id, task.id));

    const resumed = await model.request({
      idempotencyKey: 'orchestrator:RUN-6:plan-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (resumed.state === 'busy') throw new Error('unexpected busy');
    expect(resumed).toMatchObject({
      dispatch: { agentId: 'dispatch-agent-1', phase: 'requested', waitingReason: null },
      state: 'existing',
    });
  });

  it('cancels a dispatch whose assigned Agent changed before claim', async () => {
    await db.insert(agents).values([
      { id: 'dispatch-agent-old', userId, workspaceId },
      { id: 'dispatch-agent-new', userId, workspaceId },
    ]);
    const task = await createTask('RUN-7', 7);
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-agent-old' })
      .where(eq(tasks.id, task.id));
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-7:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-agent-new' })
      .where(eq(tasks.id, task.id));

    await expect(
      model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000),
    ).resolves.toBeNull();
    await expect(model.findById(requested.dispatch.id)).resolves.toMatchObject({
      phase: 'canceled',
      waitingReason: 'superseded_before_claim',
    });
  });

  it('fences cancellation and makes completion replay idempotent', async () => {
    const task = await createTask('RUN-8', 8);
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-8:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
    const running = await model.transition({
      dispatchId: requested.dispatch.id,
      expected: ['claimed'],
      fence: claim!.fence,
      operationId: 'operation-8',
      owner: 'worker-a',
      phase: 'running',
    });
    const stopping = await model.requestStop({
      dispatchId: requested.dispatch.id,
      fence: running!.fence,
      generation: running!.generation,
      operationId: 'operation-8',
      reason: 'user_cancel',
    });
    expect(stopping?.fence).toBe(running!.fence + 1);
    await expect(
      model.settle({
        dispatchId: requested.dispatch.id,
        expected: ['running'],
        fence: running!.fence,
        generation: running!.generation,
        operationId: 'operation-8',
        phase: 'succeeded',
      }),
    ).resolves.toBeNull();

    const settled = await model.settle({
      dispatchId: requested.dispatch.id,
      expected: ['cancel_requested'],
      fence: stopping!.fence,
      generation: stopping!.generation,
      operationId: 'operation-8',
      phase: 'canceled',
    });
    expect(settled).toMatchObject({ dispatch: { phase: 'canceled' }, state: 'settled' });
    await expect(
      model.settle({
        dispatchId: requested.dispatch.id,
        expected: ['cancel_requested'],
        fence: stopping!.fence,
        generation: stopping!.generation,
        operationId: 'operation-8',
        phase: 'failed',
      }),
    ).resolves.toMatchObject({ dispatch: { phase: 'canceled' }, state: 'already_settled' });
  });

  it('leases and atomically settles a durable cancellation without a runtime operation', async () => {
    const task = await createTask('RUN-9', 9);
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'orchestrator:RUN-9:plan-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    const provision = await model.claimForProvisioning(
      requested.dispatch.id,
      'runner-worker',
      60_000,
    );
    const running = await model.transition({
      dispatchId: requested.dispatch.id,
      expected: ['claimed'],
      fence: provision!.fence,
      owner: 'runner-worker',
      phase: 'running',
    });
    await db.update(tasks).set({ status: 'running' }).where(eq(tasks.id, task.id));

    const stopping = await model.requestStop({
      dispatchId: requested.dispatch.id,
      fence: running!.fence,
      generation: running!.generation,
      reason: 'planning_request_stop',
    });
    expect(stopping).toMatchObject({ phase: 'cancel_requested' });
    await expect(TaskDispatchModel.findCancellationCandidates(db)).resolves.toContainEqual({
      dispatchId: requested.dispatch.id,
      workspaceId,
    });

    const firstClaim = await model.claimCancellation(
      requested.dispatch.id,
      'cancel-worker-a',
      1000,
    );
    expect(firstClaim?.fence).toBe(stopping!.fence);
    await expect(
      model.claimCancellation(requested.dispatch.id, 'cancel-worker-b', 1000),
    ).resolves.toBeNull();
    await expect(
      model.retryCancellation({
        dispatchId: requested.dispatch.id,
        fence: firstClaim!.fence,
        owner: 'cancel-worker-a',
        reason: 'cancel_retry:temporary gateway failure',
        retryAfterMs: 1000,
      }),
    ).resolves.toBe(true);
    await db
      .update(taskDispatches)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(taskDispatches.id, requested.dispatch.id));

    const retryClaim = await model.claimCancellation(
      requested.dispatch.id,
      'cancel-worker-b',
      1000,
    );
    const settled = await model.settleCancellation({
      dispatchId: requested.dispatch.id,
      fence: retryClaim!.fence,
      generation: retryClaim!.dispatch.generation,
      owner: 'cancel-worker-b',
    });
    expect(settled).toMatchObject({
      currentGeneration: true,
      dispatch: { phase: 'canceled' },
      topicId: null,
    });
    await expect(model.findById(requested.dispatch.id)).resolves.toMatchObject({
      leaseExpiresAt: null,
      leaseOwner: null,
      phase: 'canceled',
    });
    await expect(db.select().from(tasks).where(eq(tasks.id, task.id))).resolves.toMatchObject([
      { status: 'paused' },
    ]);
  });
});
