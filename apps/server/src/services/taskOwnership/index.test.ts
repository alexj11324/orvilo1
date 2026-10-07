// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import {
  agents,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
  workspaces,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';

import { transferTaskExecutionOwnership } from './index';

const db: OrviloDatabase = await getTestDB();
const userId = 'ownership-transfer-user';
const workspaceId = 'ownership-transfer-workspace';

const cleanup = async () => {
  await db.delete(taskTopics);
  await db.delete(taskDispatches);
  await db.delete(topics).where(eq(topics.userId, userId));
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(agents).where(eq(agents.userId, userId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: userId }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Ownership Transfer Workspace',
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
    idempotencyKey: `manual:TR-${seq}:request-1`,
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
  return running!;
};

describe('transferTaskExecutionOwnership', () => {
  it('fences the incumbent dispatch before rewriting a running task assignee', async () => {
    const taskModel = new TaskModel(db, userId, workspaceId);
    const task = await createTask('TR-1', 201, {
      assigneeAgentId: 'agent-a',
      status: 'running',
    });
    const dispatch = await createRunningDispatch(task.id, 201);
    const current = await taskModel.findById(task.id);
    if (!current) throw new Error('task missing');

    const updated = await transferTaskExecutionOwnership({
      db,
      patch: { assigneeAgentId: 'agent-b' },
      reason: 'test_transfer',
      task: current,
    });

    expect(updated).toMatchObject({ assigneeAgentId: 'agent-b', status: 'running' });
    const [fenced] = await db
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.id, dispatch.id));
    expect(fenced).toMatchObject({
      fence: dispatch.fence + 1,
      phase: 'cancel_requested',
      waitingReason: 'test_transfer',
    });
  });

  it.each(['in_progress', 'in_review'] as const)(
    'moves a resting %s issue to To Do atomically with clearing its Agent',
    async (workflowCategory) => {
      const taskModel = new TaskModel(db, userId, workspaceId);
      const task = await createTask('TR-4', 204, { assigneeAgentId: 'agent-a' });
      const current = await taskModel.findById(task.id);
      if (!current) throw new Error('task missing');
      const updated = await transferTaskExecutionOwnership({
        db,
        patch: { assigneeAgentId: null },
        reason: 'test_transfer',
        task: { ...current, workflowCategory, workflowStateRefId: 'old-active-state' },
      });
      expect(updated).toMatchObject({
        assigneeAgentId: null,
        workflowCategory: 'todo',
        workflowStateRefId: null,
      });
    },
  );

  it('rewrites a non-running task assignee without touching dispatches', async () => {
    const taskModel = new TaskModel(db, userId, workspaceId);
    const task = await createTask('TR-2', 202, { assigneeAgentId: 'agent-a' });
    const current = await taskModel.findById(task.id);
    if (!current) throw new Error('task missing');

    const updated = await transferTaskExecutionOwnership({
      db,
      patch: { assigneeAgentId: 'agent-b' },
      reason: 'test_transfer',
      task: current,
    });

    expect(updated).toMatchObject({ assigneeAgentId: 'agent-b' });
    const rows = await db.select().from(taskDispatches).where(eq(taskDispatches.taskId, task.id));
    expect(rows).toHaveLength(0);
  });

  it('honors the expectedDomainRevision CAS against interleaving writes', async () => {
    const taskModel = new TaskModel(db, userId, workspaceId);
    const task = await createTask('TR-3', 203, { assigneeAgentId: 'agent-a' });
    const current = await taskModel.findById(task.id);
    if (!current) throw new Error('task missing');

    await expect(
      transferTaskExecutionOwnership({
        db,
        mutation: { expectedDomainRevision: current.domainRevision + 1 },
        patch: { assigneeAgentId: 'agent-b' },
        reason: 'test_transfer',
        task: current,
      }),
    ).rejects.toThrow('TASK_REVISION_CONFLICT');
    const unchanged = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(unchanged[0]).toMatchObject({ assigneeAgentId: 'agent-a' });
  });
});
