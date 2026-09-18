// @vitest-environment node
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import type { tasks } from '../../schemas';
import { agents, projects, teamCycles, teams, users, workspaces } from '../../schemas';
import { actionApprovals } from '../../schemas/actionApproval';
import { executionGrants } from '../../schemas/executionGrant';
import { tasks as tasksTable } from '../../schemas/task';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import { TaskSubscriptionModel } from '../taskSubscription';
import { myWorkQueryForMode, WorkQueryError, WorkQueryModel } from '../workQuery';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'work-query-user';
const otherUserId = 'work-query-other';
const workspaceId = 'work-query-ws';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await serverDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Query WS',
    primaryOwnerId: userId,
    slug: 'work-query-ws',
  });
});

afterEach(async () => {
  await serverDB.delete(users);
});

const createTask = async (owner: string, values: Partial<typeof tasks.$inferInsert> = {}) => {
  const model = new TaskModel(serverDB, owner, workspaceId);
  return model.create({ instruction: values.instruction ?? 'Do the work', ...values });
};

describe('validateWorkQuery', () => {
  it('rejects unknown fields instead of silently widening', async () => {
    await expect(
      new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
        query: {
          entityType: 'task',
          filter: { all: [{ field: 'secretColumn' as never, op: 'eq', value: 'x' }] },
          schemaVersion: 1,
        },
      }),
    ).rejects.toBeInstanceOf(WorkQueryError);
  });
});

describe('WorkQueryModel', () => {
  it('lists assigned tasks for the visitor, not the view owner', async () => {
    const mine = await createTask(userId, { assigneeUserId: userId, name: 'Mine' });
    await createTask(userId, { assigneeUserId: otherUserId, name: 'Theirs' });

    const asMe = new WorkQueryModel(serverDB, userId, workspaceId);
    const asOther = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    const query = myWorkQueryForMode('assigned');

    const mineResult = await asMe.queryTasks({ query });
    const otherResult = await asOther.queryTasks({ query });

    expect(mineResult.tasks.map((row) => row.id)).toEqual([mine.id]);
    expect(otherResult.tasks.map((row) => row.name)).toEqual(['Theirs']);
    expect(mineResult.queryHash).toBe(otherResult.queryHash);
  });

  it('treats delegated work as an explicit grant, not agent ownership', async () => {
    await serverDB.insert(agents).values({ id: 'agt_shared', slug: 'shared', userId });
    const someoneElses = await createTask(otherUserId, {
      assigneeAgentId: 'agt_shared',
      name: 'Not mine',
    });
    const granted = await createTask(otherUserId, { name: 'I asked for this' });
    await serverDB.insert(executionGrants).values({
      agentId: 'agt_shared',
      id: 'grant-delegated',
      initiatedBy: userId,
      status: 'active',
      taskId: granted.id,
      workspaceId,
    });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      mode: 'delegated',
      query: myWorkQueryForMode('delegated'),
    });

    expect(result.tasks.map((row) => row.id)).toEqual([granted.id]);
    expect(result.tasks.map((row) => row.id)).not.toContain(someoneElses.id);
  });

  it('keeps review responsibility even when the inbox row is gone', async () => {
    const reviewed = await createTask(otherUserId, {
      name: 'Needs review',
      reviewerUserId: userId,
    });
    await serverDB.insert(actionApprovals).values({
      actionType: 'tool.danger',
      approverUserId: userId,
      id: 'apr_pending',
      status: 'pending',
      targetId: reviewed.id,
      targetType: 'task',
      workspaceId,
    });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      query: myWorkQueryForMode('review'),
    });

    expect(result.tasks.map((row) => row.id)).toContain(reviewed.id);
  });

  it('keeps assigned and review lists after unsubscribe', async () => {
    const task = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Followed then not',
      reviewerUserId: userId,
    });
    const follows = new TaskSubscriptionModel(serverDB, userId, workspaceId);
    await follows.subscribe(task.id);
    await follows.unsubscribe(task.id);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const assigned = await model.queryTasks({
      query: myWorkQueryForMode('assigned'),
    });
    const review = await model.queryTasks({
      query: myWorkQueryForMode('review'),
    });
    const subscribed = await model.queryTasks({
      mode: 'subscribed',
      query: myWorkQueryForMode('subscribed'),
    });

    expect(assigned.tasks.map((row) => row.id)).toContain(task.id);
    expect(review.tasks.map((row) => row.id)).toContain(task.id);
    expect(subscribed.tasks.map((row) => row.id)).not.toContain(task.id);
  });

  it('treats projectId isNull as distinct from an empty in-list', async () => {
    await serverDB.insert(projects).values({
      id: 'wq-project',
      identifier: 'WQ01',
      name: 'Query project',
      userId,
      workspaceId,
    });
    const loose = await createTask(userId, { name: 'No project' });
    const bound = await createTask(userId, { name: 'In a project', projectId: 'wq-project' });
    const model = new WorkQueryModel(serverDB, userId, workspaceId);

    const nullProject = await model.queryTasks({
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'projectId', op: 'isNull' }] },
        schemaVersion: 1,
      },
    });
    expect(nullProject.tasks.map((row) => row.id)).toContain(loose.id);
    expect(nullProject.tasks.map((row) => row.id)).not.toContain(bound.id);

    await expect(
      model.queryTasks({
        query: {
          entityType: 'task',
          filter: { all: [{ field: 'projectId', op: 'in', value: [] }] },
          schemaVersion: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  });

  it('pages with a queryHash-bound keyset and does not shrink total', async () => {
    const created = await Promise.all([
      createTask(userId, { name: 'A' }),
      createTask(userId, { name: 'B' }),
      createTask(userId, { name: 'C' }),
    ]);
    const stamp = new Date('2026-09-18T12:00:00Z');
    await serverDB
      .update(tasksTable)
      .set({ updatedAt: stamp })
      .where(
        inArray(
          tasksTable.id,
          created.map((row) => row.id),
        ),
      );

    const query = {
      entityType: 'task' as const,
      filter: {
        all: [{ field: 'id' as const, op: 'in' as const, value: created.map((row) => row.id) }],
      },
      schemaVersion: 1 as const,
      sort: [
        { direction: 'desc' as const, field: 'updatedAt' as const },
        { direction: 'asc' as const, field: 'id' as const },
      ],
    };
    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const first = await model.queryTasks({ limit: 2, query });
    expect(first.total).toBe(3);
    expect(first.tasks).toHaveLength(2);

    await expect(
      model.queryTasks({ afterId: first.tasks[1]!.id, limit: 2, query }),
    ).rejects.toMatchObject({ code: 'CURSOR_INVALID' });
    await expect(
      model.queryTasks({
        afterId: first.tasks[1]!.id,
        limit: 2,
        query,
        queryHash: 'not-this-query',
      }),
    ).rejects.toMatchObject({ code: 'CURSOR_INVALID' });

    const second = await model.queryTasks({
      afterId: first.tasks[1]!.id,
      limit: 2,
      query,
      queryHash: first.queryHash,
    });
    expect(second.total).toBe(3);
    expect(second.tasks).toHaveLength(1);
    const paged = [...first.tasks, ...second.tasks].map((row) => row.id).sort();
    expect(paged).toEqual(created.map((row) => row.id).sort());
    expect(second.tasks[0]!.id).not.toBe(first.tasks[0]!.id);
    expect(second.tasks[0]!.id).not.toBe(first.tasks[1]!.id);
  });

  it('filters by an existing cycle id and treats missing cycle as isNull', async () => {
    await serverDB.insert(teams).values({
      createdByUserId: userId,
      id: 'wq-team',
      key: 'WQ',
      name: 'Query team',
      workspaceId,
    });
    const [cycle] = await serverDB
      .insert(teamCycles)
      .values({ name: 'Cycle 1', teamId: 'wq-team', workspaceId })
      .returning();
    const inCycle = await createTask(userId, { cycleRefId: cycle!.id, name: 'In cycle' });
    const loose = await createTask(userId, { name: 'No cycle' });
    const model = new WorkQueryModel(serverDB, userId, workspaceId);

    const matched = await model.queryTasks({
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'cycleId', op: 'eq', value: cycle!.id }] },
        schemaVersion: 1,
      },
    });
    expect(matched.tasks.map((row) => row.id)).toEqual([inCycle.id]);

    const none = await model.queryTasks({
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'cycleId', op: 'isNull' }] },
        schemaVersion: 1,
      },
    });
    expect(none.tasks.map((row) => row.id)).toContain(loose.id);
    expect(none.tasks.map((row) => row.id)).not.toContain(inCycle.id);
  });
});
