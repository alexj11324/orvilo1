// @vitest-environment node
import { applyNoProjectFilter, WORK_QUERY_MAX_IN_VALUES } from '@orvilo/types';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import type { tasks } from '../../schemas';
import { agents, projects, teamCycles, teamMembers, teams, users, workspaces } from '../../schemas';
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

  it('rejects oversized in arrays instead of compiling unbounded SQL', async () => {
    const error = await new WorkQueryModel(serverDB, userId, workspaceId)
      .queryTasks({
        query: {
          entityType: 'task',
          filter: {
            all: [
              {
                field: 'id',
                op: 'in',
                value: Array.from({ length: WORK_QUERY_MAX_IN_VALUES + 1 }, (_, i) => `id-${i}`),
              },
            ],
          },
          schemaVersion: 1,
        },
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WorkQueryError);
    expect(error).toMatchObject({ code: 'QUERY_TOO_COMPLEX' });
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

  it('groups a board in the database so a later column is not dropped by the page', async () => {
    const stamp = new Date('2026-09-18T15:00:00Z');
    const todoA = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Todo A',
      workflowCategory: 'todo',
    });
    const todoB = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Todo B',
      workflowCategory: 'todo',
    });
    const todoC = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Todo C',
      workflowCategory: 'todo',
    });
    const child = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Child in progress',
      parentTaskId: todoA.id,
      workflowCategory: 'in_progress',
    });
    const done = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Done later',
      workflowCategory: 'done',
    });
    await serverDB
      .update(tasksTable)
      .set({ updatedAt: stamp })
      .where(inArray(tasksTable.id, [todoA.id, todoB.id, todoC.id, child.id, done.id]));

    const query = {
      ...myWorkQueryForMode('assigned'),
      groupBy: 'workflowCategory' as const,
      layout: 'board' as const,
    };
    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const first = await model.queryTasks({ limit: 2, query });

    expect(first.layout).toBe('board');
    expect(first.total).toBe(5);
    const byKey = new Map(first.groups?.map((group) => [group.key, group]));
    expect(byKey.get('todo')?.total).toBe(3);
    expect(byKey.get('todo')?.tasks).toHaveLength(2);
    expect(byKey.get('in_progress')?.tasks.map((row) => row.id)).toEqual([child.id]);
    expect(byKey.get('done')?.tasks.map((row) => row.id)).toEqual([done.id]);

    await expect(
      model.queryTasks({
        afterId: byKey.get('todo')!.tasks[1]!.id,
        limit: 2,
        query,
        queryHash: first.queryHash,
      }),
    ).rejects.toMatchObject({ code: 'CURSOR_INVALID' });

    const second = await model.queryTasks({
      afterId: byKey.get('todo')!.tasks[1]!.id,
      groupKey: 'todo',
      limit: 2,
      query,
      queryHash: first.queryHash,
    });
    expect(second.total).toBe(5);
    const todoPage = second.groups?.find((group) => group.key === 'todo');
    expect(todoPage?.total).toBe(3);
    expect(todoPage?.tasks).toHaveLength(1);
    expect(todoPage?.tasks[0]!.id).not.toBe(byKey.get('todo')!.tasks[0]!.id);
    expect(todoPage?.tasks[0]!.id).not.toBe(byKey.get('todo')!.tasks[1]!.id);
    expect(second.groups?.find((group) => group.key === 'done')?.total).toBe(1);
  });

  it('lists a readable PR review without creating a Task', async () => {
    const before = await serverDB.select({ id: tasksTable.id }).from(tasksTable);
    await serverDB.insert(actionApprovals).values({
      actionSummary: { title: 'Review the checkout PR' },
      actionType: 'github.pull_request.review',
      approverUserId: userId,
      id: 'apr_pr_review',
      status: 'pending',
      targetId: 'https://github.com/orvilo/app/pull/12',
      targetType: 'github_pull_request',
      workspaceId,
    });
    await serverDB.insert(actionApprovals).values({
      actionSummary: { title: 'Task approval stays on the task list' },
      actionType: 'tool.danger',
      approverUserId: userId,
      id: 'apr_task_review',
      status: 'pending',
      targetId: 'task_not_a_pr',
      targetType: 'task',
      workspaceId,
    });

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const reviews = await model.queryExternalReviews();
    const after = await serverDB.select({ id: tasksTable.id }).from(tasksTable);

    expect(reviews.map((row) => row.targetType)).toEqual(['github_pull_request']);
    expect(reviews[0]?.title).toBe('Review the checkout PR');
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  });

  it('does not list a private team or its public-visibility tasks to a non-member', async () => {
    await serverDB.insert(teams).values({
      createdByUserId: userId,
      id: 'wq-private-team',
      key: 'SEC',
      name: 'Secret Squadron',
      visibility: 'private',
      workspaceId,
    });
    await serverDB.insert(teamMembers).values({
      role: 'lead',
      teamId: 'wq-private-team',
      userId,
      workspaceId,
    });
    const secret = await createTask(userId, {
      name: 'Private-team work',
      teamId: 'wq-private-team',
      visibility: 'public',
    });
    const assigned = await createTask(userId, {
      assigneeUserId: otherUserId,
      name: 'Assigned on the private team',
      teamId: 'wq-private-team',
      visibility: 'public',
    });

    const asMember = new WorkQueryModel(serverDB, userId, workspaceId);
    const asOutsider = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    const teamFilter = {
      entityType: 'task' as const,
      filter: { all: [{ field: 'teamId' as const, op: 'eq' as const, value: 'wq-private-team' }] },
      schemaVersion: 1 as const,
    };

    const memberHits = await asMember.queryTasks({ query: teamFilter });
    expect(memberHits.tasks.map((row) => row.id).sort()).toEqual([assigned.id, secret.id].sort());

    const outsiderHits = await asOutsider.queryTasks({ query: teamFilter });
    expect(outsiderHits.tasks).toEqual([]);
    expect(outsiderHits.total).toBe(0);
    expect(outsiderHits.tasks.map((row) => row.name)).not.toContain('Private-team work');
    expect(outsiderHits.tasks.map((row) => row.teamId)).not.toContain('wq-private-team');

    const outsiderIsNotNull = await asOutsider.queryTasks({
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'teamId', op: 'isNotNull' }] },
        schemaVersion: 1,
      },
    });
    expect(outsiderIsNotNull.tasks.map((row) => row.id)).not.toContain(secret.id);
    expect(outsiderIsNotNull.tasks.map((row) => row.teamId)).not.toContain('wq-private-team');

    const assignedAnyway = await asOutsider.queryTasks({
      query: myWorkQueryForMode('assigned'),
    });
    expect(assignedAnyway.tasks.map((row) => row.id)).toContain(assigned.id);
  });

  it('still finds a readable task by title while a guessed teamId stays empty', async () => {
    await serverDB.insert(teams).values({
      createdByUserId: userId,
      id: 'wq-hidden-team',
      key: 'HID',
      name: 'Hidden Fleet',
      visibility: 'private',
      workspaceId,
    });
    await serverDB.insert(teamMembers).values({
      role: 'lead',
      teamId: 'wq-hidden-team',
      userId,
      workspaceId,
    });
    await createTask(userId, {
      name: 'Fleet briefing',
      teamId: 'wq-hidden-team',
      visibility: 'public',
    });

    const outsider = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    const byTitle = await outsider.searchTasks('Fleet briefing');
    expect(byTitle.map((row) => row.name)).toEqual(['Fleet briefing']);

    const byTeam = await outsider.queryTasks({
      query: {
        entityType: 'task',
        filter: { all: [{ field: 'teamId', op: 'eq', value: 'wq-hidden-team' }] },
        schemaVersion: 1,
      },
    });
    expect(byTeam.tasks).toEqual([]);
    expect(byTeam.total).toBe(0);
    expect(byTeam.tasks.map((row) => row.teamId)).not.toContain('wq-hidden-team');
  });

  it('does not treat integration-imported tasks as created by the installer', async () => {
    const imported = await new TaskModel(serverDB, userId, workspaceId).create(
      { instruction: 'From Linear', name: 'Imported issue' },
      {
        creationSubject: {
          id: 'linear-installation:wq',
          kind: 'integration',
          snapshot: { displayName: 'Linear', kind: 'integration' },
        },
      },
    );
    const mine = await createTask(userId, { name: 'I filed this' });
    expect(imported.createdByUserId).toBeNull();
    expect(mine.createdByUserId).toBe(userId);

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      query: myWorkQueryForMode('created'),
    });
    expect(result.tasks.map((row) => row.id)).toContain(mine.id);
    expect(result.tasks.map((row) => row.id)).not.toContain(imported.id);
  });

  it('keeps projectless assigned work visible and does not invent a default project', async () => {
    const loose = await createTask(userId, { assigneeUserId: userId, name: 'Loose work' });
    expect(loose.projectId).toBeNull();

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const assigned = await model.queryTasks({ query: myWorkQueryForMode('assigned') });
    expect(assigned.tasks.map((row) => row.id)).toContain(loose.id);

    const noProject = await model.queryTasks({
      query: applyNoProjectFilter(myWorkQueryForMode('assigned'), true),
    });
    expect(noProject.tasks.map((row) => row.id)).toContain(loose.id);
    expect(noProject.tasks.every((row) => row.projectId == null)).toBe(true);
  });

  it('counts and facets with the same ACL as the list, without private team names', async () => {
    await serverDB.insert(teams).values({
      createdByUserId: userId,
      id: 'wq-facet-team',
      key: 'FAC',
      name: 'Secret Facet Team',
      visibility: 'private',
      workspaceId,
    });
    await serverDB.insert(teamMembers).values({
      role: 'lead',
      teamId: 'wq-facet-team',
      userId,
      workspaceId,
    });
    const assigned = await createTask(userId, {
      assigneeUserId: otherUserId,
      name: 'Assigned on a private team',
      teamId: 'wq-facet-team',
      visibility: 'public',
    });

    const outsider = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    const query = myWorkQueryForMode('assigned');
    const list = await outsider.queryTasks({ query });
    const count = await outsider.countTasks({ query });
    const facet = await outsider.facetTasks({ field: 'teamId', query });

    expect(list.tasks.map((row) => row.id)).toContain(assigned.id);
    expect(count.total).toBe(list.total);
    expect(facet.total).toBe(list.total);
    expect(count.queryHash).toBe(list.queryHash);
    expect(facet.buckets.map((bucket) => bucket.name)).not.toContain('Secret Facet Team');
    expect(facet.buckets.map((bucket) => bucket.key)).not.toContain('wq-facet-team');
    expect(facet.restrictedCount).toBeGreaterThan(0);
    expect(
      facet.restrictedCount + facet.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(facet.total);
  });
});
