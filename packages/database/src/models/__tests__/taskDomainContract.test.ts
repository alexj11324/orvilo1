// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskDispatches, tasks, users, workspaces } from '../../schemas';
import type { LobeChatDatabase } from '../../type';

const db: LobeChatDatabase = await getTestDB();
const userId = 'task-domain-user';
const workspaceId = 'task-domain-workspace';

const cleanup = async () => {
  await db.delete(taskDispatches);
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Task Domain Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

describe('task domain contract', () => {
  it('retains a shared integration-created task without a user owner', async () => {
    await db.insert(tasks).values({
      createdBySnapshot: {
        displayName: 'Linear',
        externalId: 'installation-1',
        kind: 'integration',
      },
      createdBySubjectId: 'installation-1',
      createdBySubjectKind: 'integration',
      identifier: 'LIN-1',
      instruction: 'Imported issue',
      seq: 1,
      workspaceId,
    });

    const [task] = await db.select().from(tasks).where(eq(tasks.identifier, 'LIN-1'));
    expect(task).toMatchObject({
      createdBySubjectId: 'installation-1',
      createdBySubjectKind: 'integration',
      createdByUserId: null,
      domainRevision: 1,
      executionGeneration: 0,
      requirementRevision: 1,
      workflowCategory: 'backlog',
    });
  });

  it('rejects a system or integration creator outside a workspace', async () => {
    await expect(
      db.insert(tasks).values({
        createdBySubjectKind: 'system',
        identifier: 'SYS-1',
        instruction: 'Invalid personal system task',
        seq: 1,
      }),
    ).rejects.toThrow();
  });

  it('allows only one active dispatch claim for a task', async () => {
    const [task] = await db
      .insert(tasks)
      .values({
        createdBySubjectKind: 'user',
        createdByUserId: userId,
        identifier: 'RUN-1',
        instruction: 'Run once',
        seq: 1,
        workspaceId,
      })
      .returning();

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
});
