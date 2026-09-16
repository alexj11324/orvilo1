// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { LinearSyncModel } from '@/database/models/linearSync';
import { taskPlanningRevisions, tasks, users, workspaces } from '@/database/schemas';
import type { LobeChatDatabase } from '@/database/type';

import { LinearPlanningWorker } from './planning';

const db: LobeChatDatabase = await getTestDB();
const userId = 'planning-apply-user';
const workspaceId = 'planning-apply-workspace';

const cleanup = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Planning Apply Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

const createRevision = async (name: string, requiresApproval: boolean) => {
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: userId,
      identifier: 'PLAN-1',
      instruction: 'Apply the persisted plan',
      name: 'Before planning',
      seq: 1,
      workspaceId,
    })
    .returning();
  const model = new LinearSyncModel(db, workspaceId);
  const change = await model.recordDomainEvent({
    idempotencyKey: `planning-apply:${name}`,
    payload: { taskId: task.id },
    projectId: null,
    source: 'user',
    taskId: task.id,
    type: 'task.requirement.changed',
  });
  const revision = await model.createPlanningRevision({
    eventIds: [change.event.id],
    inputRevision: change.event.revision,
    inputSnapshot: {
      tasks: [{ id: task.id, updatedAt: task.updatedAt.toISOString() }],
    },
    proposal: {
      actions: [
        {
          action: 'update_task',
          patch: { name },
          reason: 'Apply the server-persisted proposal.',
          taskId: task.id,
        },
      ],
      explanation: 'Persisted planning proposal',
      requiresApproval,
    },
    scopeId: change.scope!.id,
    status: 'proposed',
    trigger: change.scope!.lastTrigger!,
  });
  return { revision, task };
};

describe('LinearPlanningWorker.applyProposal', () => {
  it('loads the persisted proposal and enforces explicit approval', async () => {
    const { revision, task } = await createRevision('Server-approved name', true);
    const worker = new LinearPlanningWorker(db, workspaceId);

    await expect(worker.applyProposal(revision.id, userId, false)).rejects.toThrow(
      'requires explicit approval',
    );
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Before planning',
    );

    await expect(worker.applyProposal(revision.id, userId, true)).resolves.toMatchObject({
      stale: false,
      updatedTaskIds: [task.id],
    });
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Server-approved name',
    );
  });

  it('serializes concurrent apply attempts on the planning revision', async () => {
    const { revision, task } = await createRevision('Applied once', false);
    const worker = new LinearPlanningWorker(db, workspaceId);

    const results = await Promise.allSettled([
      worker.applyProposal(revision.id, userId, true),
      worker.applyProposal(revision.id, userId, true),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].name).toBe(
      'Applied once',
    );
    expect(
      (
        await db
          .select()
          .from(taskPlanningRevisions)
          .where(eq(taskPlanningRevisions.id, revision.id))
      )[0].status,
    ).toBe('applied');
  });
});
