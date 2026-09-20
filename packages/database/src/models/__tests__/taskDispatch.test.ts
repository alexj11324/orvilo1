// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, goalNodes, goals, taskDispatches, tasks, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import {
  TaskDispatchIdempotencyConflictError,
  TaskDispatchModel,
  TaskDispatchNotFoundError,
} from '../taskDispatch';

const db: OrviloDatabase = await getTestDB();
const userId = 'task-dispatch-user';
const workspaceId = 'task-dispatch-workspace';
const otherUserId = 'task-dispatch-other-user';
const otherWorkspaceId = 'task-dispatch-other-workspace';

const cleanup = async () => {
  await db.delete(goalNodes);
  await db.delete(goals).where(eq(goals.workspaceId, workspaceId));
  await db.delete(goals).where(eq(goals.workspaceId, otherWorkspaceId));
  await db.delete(taskDispatches);
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(tasks).where(eq(tasks.workspaceId, otherWorkspaceId));
  await db.delete(tasks).where(eq(tasks.createdByUserId, userId));
  await db.delete(tasks).where(eq(tasks.createdByUserId, otherUserId));
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

const createPersonalTask = async (id: string, identifier: string, seq: number) => {
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: userId,
      id,
      identifier,
      instruction: `Run ${identifier}`,
      seq,
    })
    .returning();
  return task;
};

const attachTaskToGoal = async (taskId: string, status: 'paused' | 'running', seq: number) => {
  const [goal] = await db
    .insert(goals)
    .values({
      id: `goal-${seq}`,
      status,
      title: `Goal ${seq}`,
      userId,
      workspaceId,
    })
    .returning();
  await db.insert(goalNodes).values({
    createdByUserId: userId,
    goalId: goal.id,
    kind: 'task',
    taskId,
    title: 'Owned node',
  });
  return goal;
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

  it('keeps a manually assigned member run current while the inbox Agent executes ephemerally', async () => {
    const task = await createTask('RUN-2B', 21);
    await db.insert(agents).values({ id: 'manual-inbox-agent', userId, workspaceId });
    await db.update(tasks).set({ assigneeUserId: userId }).where(eq(tasks.id, task.id));
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-2B:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    const claim = await model.claimForProvisioning(requested.dispatch.id, 'manual-runner', 60_000);
    if (!claim) throw new Error('dispatch was not claimed');
    await expect(
      model.transition({
        agentId: 'manual-inbox-agent',
        dispatchId: claim.dispatch.id,
        expected: ['claimed'],
        fence: claim.fence,
        owner: 'manual-runner',
        phase: 'claimed',
      }),
    ).resolves.toMatchObject({ agentId: 'manual-inbox-agent', phase: 'claimed' });
    await expect(
      model.transition({
        agentId: 'manual-inbox-agent',
        dispatchId: claim.dispatch.id,
        expected: ['claimed'],
        fence: claim.fence,
        operationId: 'manual-operation',
        owner: 'manual-runner',
        phase: 'running',
      }),
    ).resolves.toMatchObject({ phase: 'running' });
    await expect(
      model.settle({
        dispatchId: claim.dispatch.id,
        expected: ['running'],
        fence: claim.fence,
        generation: claim.dispatch.generation,
        operationId: 'manual-operation',
        phase: 'succeeded',
      }),
    ).resolves.toMatchObject({ currentContract: true, currentGeneration: true });
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

  it('enforces idempotency keys across personal tasks', async () => {
    const firstTask = await createPersonalTask('personal-dispatch-a', 'PERSONAL-A', 31);
    const secondTask = await createPersonalTask('personal-dispatch-b', 'PERSONAL-B', 32);
    const model = new TaskDispatchModel(db);

    await model.request({
      idempotencyKey: 'manual:personal-shared-request',
      requestedBy: userId,
      taskId: firstTask.id,
      trigger: 'manual',
    });

    await expect(
      model.request({
        idempotencyKey: 'manual:personal-shared-request',
        requestedBy: userId,
        taskId: secondTask.id,
        trigger: 'manual',
      }),
    ).rejects.toBeInstanceOf(TaskDispatchIdempotencyConflictError);
  });

  it('cascades a personal dispatch when its task is deleted', async () => {
    const task = await createPersonalTask('personal-dispatch-cascade', 'PERSONAL-CASCADE', 33);
    await db.insert(taskDispatches).values({
      generation: 1,
      id: 'personal-dispatch-cascade-row',
      idempotencyKey: 'manual:personal-cascade',
      policyRevision: 1,
      requestedBy: `manual:${userId}`,
      requirementRevision: 1,
      taskId: task.id,
      taskRevision: 1,
      workspaceId: null,
    });

    await db.delete(tasks).where(eq(tasks.id, task.id));

    await expect(
      db
        .select()
        .from(taskDispatches)
        .where(eq(taskDispatches.id, 'personal-dispatch-cascade-row')),
    ).resolves.toEqual([]);
  });

  it('leases an expired dispatch for reconciliation without invalidating its callback fence', async () => {
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
    expect(recovery?.fence).toBe(firstLease!.fence);
    const staleWrite = await model.transition({
      dispatchId: requested.dispatch.id,
      expected: ['outcome_unknown'],
      fence: firstLease!.fence,
      owner: 'worker-a',
      phase: 'running',
    });
    expect(staleWrite).toBeNull();

    await expect(
      model.releaseRecovery({
        dispatchId: requested.dispatch.id,
        fence: recovery!.fence,
        owner: 'worker-b',
        phase: 'running',
        reason: 'runtime_running',
        retryAfterMs: 1000,
      }),
    ).resolves.toBe(true);
    await expect(model.findById(requested.dispatch.id)).resolves.toMatchObject({
      fence: firstLease!.fence,
      leaseOwner: null,
      phase: 'running',
      waitingReason: 'runtime_running',
    });
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

  it('parks a current-generation result when its requirement contract changed in flight', async () => {
    const task = await createTask('RUN-4B', 41);
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-4B:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    await db
      .update(tasks)
      .set({ requirementRevision: 2, status: 'running' })
      .where(eq(tasks.id, task.id));

    const settled = await model.settle({
      dispatchId: requested.dispatch.id,
      expected: ['requested'],
      fence: requested.dispatch.fence,
      generation: requested.dispatch.generation,
      phase: 'succeeded',
    });

    expect(settled).toMatchObject({
      currentContract: false,
      currentGeneration: true,
      dispatch: { phase: 'succeeded' },
    });
    await expect(db.select().from(tasks).where(eq(tasks.id, task.id))).resolves.toMatchObject([
      {
        error: 'Task changed while this run was active; review before retrying.',
        status: 'paused',
      },
    ]);
  });

  it('keeps a result current across execution-only status revisions', async () => {
    const task = await createTask('RUN-4C', 42);
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-4C:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    await db
      .update(tasks)
      .set({ domainRevision: task.domainRevision + 1, status: 'running' })
      .where(eq(tasks.id, task.id));

    await expect(
      model.settle({
        dispatchId: requested.dispatch.id,
        expected: ['requested'],
        fence: requested.dispatch.fence,
        generation: requested.dispatch.generation,
        phase: 'succeeded',
      }),
    ).resolves.toMatchObject({ currentContract: true, currentGeneration: true });
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

  it('resumes a repaired waiting dispatch for a new request key without replacing its identity', async () => {
    const task = await createTask('RUN-6B', 61);
    await db.insert(agents).values({ id: 'dispatch-agent-2', userId, workspaceId });
    const model = new TaskDispatchModel(db, workspaceId);
    const first = await model.request({
      idempotencyKey: 'orchestrator:RUN-6B:plan-1',
      requestedBy: 'planning:first',
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (first.state === 'busy') throw new Error('unexpected busy');
    await model.markWaiting(first.dispatch.id, 'no_eligible_agent');
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-agent-2' })
      .where(eq(tasks.id, task.id));

    const resumed = await model.request({
      idempotencyKey: 'orchestrator:RUN-6B:plan-2',
      requestedBy: 'planning:second',
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (resumed.state === 'busy') throw new Error('waiting dispatch was not reconsidered');
    expect(resumed).toMatchObject({
      dispatch: {
        agentId: 'dispatch-agent-2',
        id: first.dispatch.id,
        idempotencyKey: 'orchestrator:RUN-6B:plan-1',
        phase: 'requested',
        waitingReason: null,
      },
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

  it('cancels a claimed dispatch when its execution contract changes during provisioning', async () => {
    await db.insert(agents).values({ id: 'dispatch-agent-contract', userId, workspaceId });
    const task = await createTask('RUN-7B', 72);
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-agent-contract' })
      .where(eq(tasks.id, task.id));
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-7B:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
    expect(claim).not.toBeNull();
    await expect(
      model.transition({
        dispatchId: requested.dispatch.id,
        expected: ['claimed'],
        fence: claim!.fence,
        owner: 'worker-a',
        phase: 'provisioning',
      }),
    ).resolves.toMatchObject({ phase: 'provisioning' });

    await db
      .update(tasks)
      .set({ requirementRevision: sql`${tasks.requirementRevision} + 1` })
      .where(eq(tasks.id, task.id));

    await expect(
      model.transition({
        dispatchId: requested.dispatch.id,
        expected: ['provisioning'],
        fence: claim!.fence,
        owner: 'worker-a',
        phase: 'dispatched',
      }),
    ).resolves.toBeNull();
    await expect(model.findById(requested.dispatch.id)).resolves.toMatchObject({
      fence: claim!.fence + 1,
      phase: 'canceled',
      waitingReason: 'superseded_before_dispatched',
    });
  });

  it('keeps a dispatch valid across status-only domain revisions', async () => {
    await db.insert(agents).values({ id: 'dispatch-agent-status', userId, workspaceId });
    const task = await createTask('RUN-7C', 73);
    await db
      .update(tasks)
      .set({ assigneeAgentId: 'dispatch-agent-status' })
      .where(eq(tasks.id, task.id));
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'manual:RUN-7C:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    await db
      .update(tasks)
      .set({ domainRevision: sql`${tasks.domainRevision} + 1`, status: 'running' })
      .where(eq(tasks.id, task.id));

    const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
    expect(claim).not.toBeNull();
    await expect(
      model.transition({
        dispatchId: requested.dispatch.id,
        expected: ['claimed'],
        fence: claim!.fence,
        owner: 'worker-a',
        phase: 'dispatched',
      }),
    ).resolves.toMatchObject({ phase: 'dispatched' });
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

describe('goal dispatch fence', () => {
  it('parks a new automated dispatch while the owning goal is paused', async () => {
    const task = await createTask('RUN-G1', 40);
    const goal = await attachTaskToGoal(task.id, 'paused', 1);
    const model = new TaskDispatchModel(db, workspaceId);

    const requested = await model.request({
      idempotencyKey: 'goal:RUN-G1:request-1',
      requestedBy: goal.id,
      taskId: task.id,
      trigger: 'goal',
    });

    expect(requested.state).toBe('created');
    if (requested.state === 'busy') throw new Error('unexpected busy');
    expect(requested.dispatch.phase).toBe('waiting');
    expect(requested.dispatch.waitingReason).toBe('goal_paused');
  });

  it('lets a manual request through while the owning goal is paused', async () => {
    const task = await createTask('RUN-G2', 41);
    await attachTaskToGoal(task.id, 'paused', 2);
    const model = new TaskDispatchModel(db, workspaceId);

    const requested = await model.request({
      idempotencyKey: 'manual:RUN-G2:request-1',
      requestedBy: userId,
      taskId: task.id,
      trigger: 'manual',
    });

    if (requested.state === 'busy') throw new Error('unexpected busy');
    expect(requested.dispatch.phase).toBe('requested');
    expect(requested.dispatch.waitingReason).toBeNull();
  });

  it('resumes the same waiting dispatch once the goal runs again', async () => {
    const task = await createTask('RUN-G3', 42);
    const goal = await attachTaskToGoal(task.id, 'paused', 3);
    await db.insert(agents).values({ id: 'goal-agent-3', userId, workspaceId });
    await db.update(tasks).set({ assigneeAgentId: 'goal-agent-3' }).where(eq(tasks.id, task.id));
    const model = new TaskDispatchModel(db, workspaceId);

    const parked = await model.request({
      idempotencyKey: 'goal:RUN-G3:request-1',
      requestedBy: goal.id,
      taskId: task.id,
      trigger: 'goal',
    });
    if (parked.state === 'busy') throw new Error('unexpected busy');
    expect(parked.dispatch.phase).toBe('waiting');

    await db.update(goals).set({ status: 'running' }).where(eq(goals.id, goal.id));

    const resumed = await model.request({
      idempotencyKey: 'goal:RUN-G3:request-1',
      requestedBy: goal.id,
      taskId: task.id,
      trigger: 'goal',
    });
    expect(resumed.state).toBe('existing');
    if (resumed.state === 'busy') throw new Error('unexpected busy');
    expect(resumed.dispatch.id).toBe(parked.dispatch.id);
    expect(resumed.dispatch.phase).toBe('requested');
    expect(resumed.dispatch.waitingReason).toBeNull();
  });

  it('re-parks a waiting dispatch when a stray trigger arrives while the goal stays paused', async () => {
    const task = await createTask('RUN-G4', 43);
    await attachTaskToGoal(task.id, 'paused', 4);
    await db.insert(agents).values({ id: 'goal-agent-4', userId, workspaceId });
    await db.update(tasks).set({ assigneeAgentId: 'goal-agent-4' }).where(eq(tasks.id, task.id));
    const model = new TaskDispatchModel(db, workspaceId);

    await model.request({
      idempotencyKey: 'goal:RUN-G4:request-1',
      requestedBy: 'goal-4',
      taskId: task.id,
      trigger: 'goal',
    });

    const stray = await model.request({
      idempotencyKey: 'goal:RUN-G4:request-1',
      requestedBy: 'goal-4',
      taskId: task.id,
      trigger: 'heartbeat',
    });
    if (stray.state === 'busy') throw new Error('unexpected busy');
    expect(stray.dispatch.phase).toBe('waiting');
    expect(stray.dispatch.waitingReason).toBe('goal_paused');
  });

  it('parks the dispatch at provisioning claim when the goal pauses in between', async () => {
    const task = await createTask('RUN-G5', 44);
    const goal = await attachTaskToGoal(task.id, 'running', 5);
    const model = new TaskDispatchModel(db, workspaceId);

    const requested = await model.request({
      idempotencyKey: 'goal:RUN-G5:request-1',
      requestedBy: goal.id,
      taskId: task.id,
      trigger: 'goal',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');

    await db.update(goals).set({ status: 'paused' }).where(eq(goals.id, goal.id));

    const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
    expect(claim).toBeNull();
    await expect(model.findById(requested.dispatch.id)).resolves.toMatchObject({
      phase: 'waiting',
      waitingReason: 'goal_paused',
    });
  });

  it('parks the dispatch at a transition when the goal pauses mid-flight', async () => {
    const task = await createTask('RUN-G6', 45);
    const goal = await attachTaskToGoal(task.id, 'running', 6);
    const model = new TaskDispatchModel(db, workspaceId);

    const requested = await model.request({
      idempotencyKey: 'goal:RUN-G6:request-1',
      requestedBy: goal.id,
      taskId: task.id,
      trigger: 'goal',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
    if (!claim) throw new Error('dispatch was not claimed');

    await db.update(goals).set({ status: 'paused' }).where(eq(goals.id, goal.id));

    const transitioned = await model.transition({
      dispatchId: requested.dispatch.id,
      expected: ['claimed'],
      fence: claim.fence,
      owner: 'worker-a',
      phase: 'provisioning',
    });
    expect(transitioned).toBeNull();
    await expect(model.findById(requested.dispatch.id)).resolves.toMatchObject({
      phase: 'waiting',
      waitingReason: 'goal_paused',
    });
  });
});

describe('persisted dispatch origin + final admission re-check (SA05-B)', () => {
  const seedAssigned = async (identifier: string, seq: number) => {
    await db.insert(agents).values({ id: `agent-${identifier}`, userId, workspaceId });
    const task = await createTask(identifier, seq);
    await db
      .update(tasks)
      .set({ assigneeAgentId: `agent-${identifier}` })
      .where(eq(tasks.id, task.id));
    return task;
  };

  it('persists origin, initiator and settlement evidence on the dispatch row', async () => {
    const task = await seedAssigned('ORG-1', 50);
    const model = new TaskDispatchModel(db, workspaceId);

    const requested = await model.request({
      idempotencyKey: 'orchestrator:ORG-1:settle-1',
      initiator: 'user-actor-9',
      origin: 'internal',
      requestedBy: 'planner',
      settlementGrant: { kind: 'integration_seed', sourceTopicId: 'tpc_src' },
      sourceDispatchId: 'dsp-src',
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');

    expect(requested.dispatch).toMatchObject({
      initiator: 'user-actor-9',
      origin: 'internal',
      requestedBy: 'orchestrator:planner',
      settlementGrant: { kind: 'integration_seed', sourceTopicId: 'tpc_src' },
      sourceDispatchId: 'dsp-src',
    });

    // First write wins: an idempotent replay carrying different labels cannot
    // relabel the persisted origin.
    const replay = await model.request({
      idempotencyKey: 'orchestrator:ORG-1:settle-1',
      initiator: 'other',
      origin: 'external',
      requestedBy: 'planner',
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (replay.state === 'busy') throw new Error('unexpected busy');
    expect(replay.dispatch.origin).toBe('internal');
    expect(replay.dispatch.initiator).toBe('user-actor-9');
  });

  it('parks a caid dispatch at the dispatched boundary when admission flipped off', async () => {
    const task = await seedAssigned('ORG-2', 51);
    const model = new TaskDispatchModel(db, workspaceId);
    const requested = await model.request({
      idempotencyKey: 'orchestrator:ORG-2:plan-1',
      origin: 'caid',
      requestedBy: 'planner',
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
    if (!claim) throw new Error('dispatch was not claimed');

    const parked = await model.transition({
      admissionRecheck: async () => false,
      dispatchId: requested.dispatch.id,
      expected: ['claimed'],
      fence: claim.fence,
      owner: 'worker-a',
      phase: 'dispatched',
    });

    expect(parked).toMatchObject({
      leaseOwner: null,
      phase: 'waiting',
      waitingReason: 'caid_dispatch_disabled',
    });
  });

  it('lets a caid dispatch through when admission still holds, and never gates external rows', async () => {
    const caidTask = await seedAssigned('ORG-3', 52);
    const manualTask = await seedAssigned('ORG-4', 53);
    const model = new TaskDispatchModel(db, workspaceId);
    const recheck = async () => false;

    const caid = await model.request({
      idempotencyKey: 'orchestrator:ORG-3:plan-1',
      origin: 'caid',
      requestedBy: 'planner',
      taskId: caidTask.id,
      trigger: 'orchestrator',
    });
    const manual = await model.request({
      idempotencyKey: 'manual:ORG-4:request-1',
      origin: 'external',
      requestedBy: userId,
      taskId: manualTask.id,
      trigger: 'manual',
    });
    if (caid.state === 'busy' || manual.state === 'busy') throw new Error('unexpected busy');

    for (const [dispatch, allowed] of [
      [caid.dispatch, true],
      [manual.dispatch, false],
    ] as const) {
      const claim = await model.claimForProvisioning(dispatch.id, 'worker-a', 60_000);
      if (!claim) throw new Error('dispatch was not claimed');
      await expect(
        model.transition({
          admissionRecheck: allowed ? async () => true : recheck,
          dispatchId: dispatch.id,
          expected: ['claimed'],
          fence: claim.fence,
          owner: 'worker-a',
          phase: 'dispatched',
        }),
      ).resolves.toMatchObject({ phase: 'dispatched' });
    }
  });

  it("derives a legacy row's origin from the requestedBy trigger prefix", async () => {
    const task = await seedAssigned('ORG-5', 54);
    const model = new TaskDispatchModel(db, workspaceId);
    // Pre-origin schema row: no origin column value — the trigger prefix of
    // `requestedBy` ('orchestrator:…') still classifies it as caid.
    const requested = await model.request({
      idempotencyKey: 'orchestrator:ORG-5:plan-1',
      requestedBy: 'planner',
      taskId: task.id,
      trigger: 'orchestrator',
    });
    if (requested.state === 'busy') throw new Error('unexpected busy');
    expect(requested.dispatch.origin).toBeNull();
    const claim = await model.claimForProvisioning(requested.dispatch.id, 'worker-a', 60_000);
    if (!claim) throw new Error('dispatch was not claimed');

    const parked = await model.transition({
      admissionRecheck: async () => false,
      dispatchId: requested.dispatch.id,
      expected: ['claimed'],
      fence: claim.fence,
      owner: 'worker-a',
      phase: 'dispatched',
    });

    expect(parked?.waitingReason).toBe('caid_dispatch_disabled');
  });
});
