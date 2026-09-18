// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  taskDependencies,
  taskDomainEvents,
  taskPlanningScopes,
  tasks,
  users,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';

const db: OrviloDatabase = await getTestDB();
const userId = 'task-domain-user';
const workspaceId = 'task-domain-workspace';

const cleanup = async () => {
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

  it('atomically versions and publishes every unlinked task command', async () => {
    const model = new TaskModel(db, userId, workspaceId);
    const task = await model.create(
      { instruction: 'Initial requirement', name: 'Initial task' },
      { mutation: { idempotencyKey: 'command:create', source: 'user' } },
    );
    const changed = await model.update(
      task.id,
      { instruction: 'Revised requirement', priority: 2 },
      { idempotencyKey: 'command:update', source: 'user' },
    );

    expect(changed).toMatchObject({ domainRevision: 2, requirementRevision: 2 });
    const events = await db
      .select()
      .from(taskDomainEvents)
      .where(eq(taskDomainEvents.workspaceId, workspaceId));
    expect(events).toHaveLength(2);
    expect(
      events.map(({ idempotencyKey, source, type }) => ({ idempotencyKey, source, type })),
    ).toEqual([
      { idempotencyKey: 'command:create', source: 'user', type: 'task.created' },
      { idempotencyKey: 'command:update', source: 'user', type: 'task.requirement.changed' },
    ]);
    expect(events[1]?.payload).toMatchObject({
      aggregateRevision: 2,
      changedFields: ['instruction', 'priority'],
    });

    const [scope] = await db
      .select()
      .from(taskPlanningScopes)
      .where(eq(taskPlanningScopes.workspaceId, workspaceId));
    expect(scope).toMatchObject({
      dirtyRevision: events[1]?.revision,
      scopeId: workspaceId,
      scopeType: 'workspace',
      status: 'queued',
    });
  });

  it('publishes priority changes without invalidating the active requirement contract', async () => {
    const model = new TaskModel(db, userId, workspaceId);
    const task = await model.create(
      { instruction: 'Stable requirement', priority: 1 },
      { mutation: { idempotencyKey: 'command:create:priority', source: 'user' } },
    );

    const changed = await model.update(
      task.id,
      { priority: 3 },
      { idempotencyKey: 'command:update:priority', source: 'user' },
    );

    expect(changed).toMatchObject({
      domainRevision: task.domainRevision + 1,
      priority: 3,
      requirementRevision: task.requirementRevision,
    });
    const [event] = await db
      .select()
      .from(taskDomainEvents)
      .where(eq(taskDomainEvents.idempotencyKey, 'command:update:priority'));
    expect(event).toMatchObject({
      payload: expect.objectContaining({ changedFields: ['priority'] }),
      type: 'task.requirement.changed',
    });
  });

  it('does not let a late verifier complete a task that was manually paused', async () => {
    const model = new TaskModel(db, userId, workspaceId);
    const task = await model.create(
      { instruction: 'Verify this run' },
      { mutation: { idempotencyKey: 'command:create:verify-race', source: 'user' } },
    );
    const [running] = await db
      .update(tasks)
      .set({ status: 'running' })
      .where(eq(tasks.id, task.id))
      .returning();
    const expected = {
      assigneeAgentId: running.assigneeAgentId,
      executionGeneration: running.executionGeneration,
      policyRevision: running.policyRevision,
      requirementRevision: running.requirementRevision,
      status: 'running',
    };
    await db.update(tasks).set({ status: 'paused' }).where(eq(tasks.id, task.id));

    await expect(
      model.updateStatusForExecutionContract(task.id, 'completed', expected),
    ).resolves.toBeNull();
    await expect(model.findById(task.id)).resolves.toMatchObject({ status: 'paused' });
  });

  it('publishes dependency changes once and advances the execution contract revision', async () => {
    const model = new TaskModel(db, userId, workspaceId);
    const task = await model.create(
      { instruction: 'Downstream' },
      { mutation: { idempotencyKey: 'command:create:downstream', source: 'user' } },
    );
    const dependency = await model.create(
      { instruction: 'Upstream' },
      { mutation: { idempotencyKey: 'command:create:upstream', source: 'user' } },
    );

    await model.addDependency(task.id, dependency.id, 'blocks', {
      idempotencyKey: 'command:dependency:add',
      source: 'user',
    });
    await model.addDependency(task.id, dependency.id, 'blocks', {
      idempotencyKey: 'command:dependency:add:duplicate',
      source: 'user',
    });

    const afterAdd = await model.findById(task.id);
    expect(afterAdd).toMatchObject({ domainRevision: 2, requirementRevision: 2 });
    expect(
      await db.select().from(taskDependencies).where(eq(taskDependencies.taskId, task.id)),
    ).toHaveLength(1);

    await model.removeDependency(task.id, dependency.id, {
      idempotencyKey: 'command:dependency:remove',
      source: 'user',
    });
    const afterRemove = await model.findById(task.id);
    expect(afterRemove).toMatchObject({ domainRevision: 3, requirementRevision: 3 });

    const dependencyEvents = (
      await db.select().from(taskDomainEvents).where(eq(taskDomainEvents.workspaceId, workspaceId))
    ).filter(({ type }) => type === 'task.dependency.changed');
    expect(dependencyEvents.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'command:dependency:add',
      'command:dependency:remove',
    ]);
  });

  it('versions comment commands without storing comment bodies in domain events', async () => {
    const model = new TaskModel(db, userId, workspaceId);
    const task = await model.create(
      { instruction: 'Discuss this task' },
      { mutation: { idempotencyKey: 'command:create:comment-task', source: 'user' } },
    );
    const comment = await model.addComment(
      {
        authorUserId: userId,
        content: 'Private comment body',
        taskId: task.id,
        userId,
      },
      { idempotencyKey: 'command:comment:create', source: 'user' },
    );
    await model.updateComment(comment.id, 'Edited private body', {
      mutation: { idempotencyKey: 'command:comment:update', source: 'user' },
    });
    await model.deleteComment(comment.id, {
      idempotencyKey: 'command:comment:delete',
      source: 'user',
    });

    expect(await model.findById(task.id)).toMatchObject({
      domainRevision: 4,
      requirementRevision: 4,
    });
    const events = (
      await db.select().from(taskDomainEvents).where(eq(taskDomainEvents.workspaceId, workspaceId))
    ).filter(({ type }) => type === 'task.comment.changed');
    expect(events.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'command:comment:create',
      'command:comment:update',
      'command:comment:delete',
    ]);
    expect(JSON.stringify(events)).not.toContain('Private comment body');
    expect(JSON.stringify(events)).not.toContain('Edited private body');
  });

  it('keeps an auditable planner fact after a task row is deleted', async () => {
    const model = new TaskModel(db, userId, workspaceId);
    const task = await model.create(
      { instruction: 'Delete me', projectId: undefined },
      { mutation: { idempotencyKey: 'command:create:deleted-task', source: 'user' } },
    );

    expect(
      await model.delete(task.id, {
        idempotencyKey: 'command:delete:task',
        source: 'user',
      }),
    ).toBe(true);
    expect(await model.findById(task.id)).toBeNull();

    const [event] = await db
      .select()
      .from(taskDomainEvents)
      .where(eq(taskDomainEvents.idempotencyKey, 'command:delete:task'));
    expect(event).toMatchObject({
      source: 'user',
      taskId: null,
      type: 'task.deleted',
    });
    expect(event.payload).toMatchObject({
      aggregateRevision: 2,
      changedFields: ['deleted'],
      task: { identifier: task.identifier, visibility: task.visibility },
    });
  });
});
