// @vitest-environment node
import {
  applyDelegatedFilter,
  applyNoProjectFilter,
  WORK_QUERY_MAX_IN_VALUES,
} from '@orvilo/types';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import type { tasks } from '../../schemas';
import {
  agents,
  projectMembers,
  projects,
  projectTeams,
  teamCycles,
  teamMembers,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import { actionApprovals } from '../../schemas/actionApproval';
import { executionGrants } from '../../schemas/executionGrant';
import { tasks as tasksTable } from '../../schemas/task';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import { TaskSubscriptionModel } from '../taskSubscription';
import {
  applyWorkQueryLayout,
  myWorkQueryForMode,
  workQueryBoardGroupBy,
  WorkQueryError,
  WorkQueryModel,
} from '../workQuery';

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

describe('applyWorkQueryLayout', () => {
  it('defaults a list to server status groups and keeps an explicit none flat', () => {
    const assigned = myWorkQueryForMode('assigned');
    expect(applyWorkQueryLayout(assigned, 'list')).toMatchObject({
      groupBy: 'status',
      layout: 'list',
    });
    expect(applyWorkQueryLayout(assigned, 'list', 'none')).toMatchObject({
      groupBy: 'none',
      layout: 'list',
    });
    expect(applyWorkQueryLayout(assigned, 'board')).toMatchObject({
      groupBy: 'workflowCategory',
      layout: 'board',
    });
    expect(workQueryBoardGroupBy(applyWorkQueryLayout(assigned, 'list'))).toBe('status');
    expect(workQueryBoardGroupBy({ ...assigned, groupBy: 'none', layout: 'list' })).toBeUndefined();
    expect(workQueryBoardGroupBy({ ...assigned, groupBy: 'none', layout: 'board' })).toBe(
      'workflowCategory',
    );
  });
});

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

  it('activity unions every user relationship, including delegation and subscription', async () => {
    await serverDB.insert(agents).values({ id: 'agt_act', slug: 'act', userId });
    const assigned = await createTask(otherUserId, { assigneeUserId: userId, name: 'A' });
    const created = await createTask(userId, { name: 'C' });
    const reviewed = await createTask(otherUserId, { name: 'R', reviewerUserId: userId });
    const delegated = await createTask(otherUserId, { name: 'D' });
    await serverDB.insert(executionGrants).values({
      agentId: 'agt_act',
      id: 'grant-act',
      initiatedBy: userId,
      status: 'active',
      taskId: delegated.id,
      workspaceId,
    });
    const followed = await createTask(otherUserId, { name: 'F' });
    await new TaskSubscriptionModel(serverDB, userId, workspaceId).subscribe(followed.id);
    const unrelated = await createTask(otherUserId, { name: 'Not mine' });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      mode: 'activity',
      query: myWorkQueryForMode('activity'),
    });

    const ids = result.tasks.map((row) => row.id);
    expect(ids).toEqual(
      expect.arrayContaining([assigned.id, created.id, reviewed.id, delegated.id, followed.id]),
    );
    expect(ids).not.toContain(unrelated.id);
  });

  it('activity scoped by the delegated filter matches the old delegated tab', async () => {
    await serverDB.insert(agents).values({ id: 'agt_delf', slug: 'delf', userId });
    const delegated = await createTask(otherUserId, { name: 'Delegated' });
    await serverDB.insert(executionGrants).values({
      agentId: 'agt_delf',
      id: 'grant-delf',
      initiatedBy: userId,
      status: 'active',
      taskId: delegated.id,
      workspaceId,
    });
    const assignedOnly = await createTask(otherUserId, {
      assigneeUserId: userId,
      name: 'Assigned not delegated',
    });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      mode: 'activity',
      query: applyDelegatedFilter(myWorkQueryForMode('activity'), true),
    });

    const ids = result.tasks.map((row) => row.id);
    expect(ids).toEqual([delegated.id]);
    expect(ids).not.toContain(assignedOnly.id);
  });

  it('reviewerUserId isNotNull lists any task in review, for the created tab', async () => {
    const inReview = await createTask(userId, { name: 'I asked', reviewerUserId: otherUserId });
    await createTask(userId, { name: 'Plain mine' });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      query: {
        entityType: 'task',
        filter: {
          all: [
            { field: 'createdByUserId', op: 'eq', value: { ref: 'currentUser' } },
            { field: 'reviewerUserId', op: 'isNotNull' },
          ],
        },
        schemaVersion: 1,
      },
    });

    expect(result.tasks.map((row) => row.id)).toEqual([inReview.id]);
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

  it('pages past a null sort value instead of stopping the keyset', async () => {
    const created = await Promise.all([
      createTask(userId, { name: 'Loose A' }),
      createTask(userId, { name: 'Loose B' }),
      createTask(userId, { name: 'Loose C' }),
    ]);
    const query = {
      entityType: 'task' as const,
      filter: {
        all: [{ field: 'id' as const, op: 'in' as const, value: created.map((row) => row.id) }],
      },
      schemaVersion: 1 as const,
      sort: [
        { direction: 'asc' as const, field: 'projectId' as const },
        { direction: 'asc' as const, field: 'id' as const },
      ],
    };
    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const first = await model.queryTasks({ limit: 2, query });
    expect(first.total).toBe(3);
    expect(first.tasks).toHaveLength(2);
    expect(first.tasks.every((row) => row.projectId == null)).toBe(true);

    const second = await model.queryTasks({
      afterId: first.tasks[1]!.id,
      limit: 2,
      query,
      queryHash: first.queryHash,
    });
    expect(second.total).toBe(3);
    expect(second.tasks).toHaveLength(1);
    expect([...first.tasks, ...second.tasks].map((row) => row.id).sort()).toEqual(
      created.map((row) => row.id).sort(),
    );
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

  it('groups a list in the database so status sections are not a page rearrange', async () => {
    const stamp = new Date('2026-09-18T16:00:00Z');
    const parent = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Parent running',
      status: 'running',
    });
    const child = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Child in review',
      parentTaskId: parent.id,
      status: 'running',
      workflowCategory: 'in_review',
      workflowStateId: 'linear-state-review',
    });
    const extraRunning = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Another running',
      status: 'running',
    });
    await serverDB
      .update(tasksTable)
      .set({ updatedAt: stamp })
      .where(inArray(tasksTable.id, [parent.id, child.id, extraRunning.id]));

    const query = applyWorkQueryLayout(myWorkQueryForMode('assigned'), 'list');
    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const first = await model.queryTasks({ limit: 1, query });

    expect(query.groupBy).toBe('status');
    expect(first.layout).toBe('list');
    expect(first.total).toBe(3);
    // Raw execution-status sections: the in-review issue is a `running` row
    // here — business categories only separate on the workflowCategory axis.
    const byKey = new Map(first.groups?.map((group) => [group.key, group]));
    expect(byKey.get('running')?.total).toBe(3);
    expect(byKey.get('running')?.tasks).toHaveLength(1);
    expect(byKey.get('needsInput')).toBeUndefined();

    const wfQuery = applyWorkQueryLayout(
      myWorkQueryForMode('assigned'),
      'list',
      'workflowCategory',
    );
    const wfFirst = await model.queryTasks({ limit: 5, query: wfQuery });
    const wfByKey = new Map(wfFirst.groups?.map((group) => [group.key, group]));
    expect(wfByKey.get('in_review')?.total).toBe(1);
    expect(wfByKey.get('in_review')?.tasks.map((row) => row.id)).toEqual([child.id]);

    const second = await model.queryTasks({
      afterId: byKey.get('running')!.tasks[0]!.id,
      groupKey: 'running',
      limit: 1,
      query,
      queryHash: first.queryHash,
    });
    const runningPage = second.groups?.find((group) => group.key === 'running');
    expect(runningPage?.total).toBe(3);
    expect(runningPage?.tasks).toHaveLength(1);
    expect(runningPage?.tasks[0]!.id).not.toBe(byKey.get('running')!.tasks[0]!.id);
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
    expect(reviews[0]?.openUrl).toBe('https://github.com/orvilo/app/pull/12');
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  });

  it('does not expose a javascript or off-allowlist review jump', async () => {
    await serverDB.insert(actionApprovals).values({
      actionSummary: { title: 'Phish' },
      actionType: 'github.pull_request.review',
      approverUserId: userId,
      id: 'apr_pr_phish',
      status: 'pending',
      targetId: 'javascript:alert(1)',
      targetType: 'github_pull_request',
      workspaceId,
    });
    await serverDB.insert(actionApprovals).values({
      actionSummary: { title: 'Evil host' },
      actionType: 'github.pull_request.review',
      approverUserId: userId,
      id: 'apr_pr_evil',
      status: 'pending',
      targetId: 'https://evil.example/phish',
      targetType: 'github_pull_request',
      workspaceId,
    });

    const reviews = await new WorkQueryModel(serverDB, userId, workspaceId).queryExternalReviews();
    const byId = new Map(reviews.map((row) => [row.id, row]));
    expect(byId.get('apr_pr_phish')?.openUrl ?? null).toBeNull();
    expect(byId.get('apr_pr_evil')?.openUrl ?? null).toBeNull();
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

    const outsiderAll = await asOutsider.queryTasks({
      query: { entityType: 'task', schemaVersion: 1 },
    });
    expect(outsiderAll.tasks.map((row) => row.id)).not.toContain(secret.id);
    expect(outsiderAll.tasks.map((row) => row.name)).not.toContain('Private-team work');
    expect((await asOutsider.searchTasks('Private-team work')).map((row) => row.name)).toEqual([]);
    expect(
      (await asOutsider.searchTasks('Assigned on the private team')).map((row) => row.name),
    ).toEqual(['Assigned on the private team']);
  });

  it('still finds a readable assigned task by title while a guessed teamId stays empty', async () => {
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
    await createTask(userId, {
      assigneeUserId: otherUserId,
      name: 'Assigned fleet note',
      teamId: 'wq-hidden-team',
      visibility: 'public',
    });

    const outsider = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    expect((await outsider.searchTasks('Fleet briefing')).map((row) => row.name)).toEqual([]);
    expect((await outsider.searchTasks('Assigned fleet note')).map((row) => row.name)).toEqual([
      'Assigned fleet note',
    ]);

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

  it('does not duplicate a project linked to two teams (TRI04)', async () => {
    await serverDB.insert(teams).values([
      {
        createdByUserId: userId,
        id: 'wq-team-a',
        key: 'WQA',
        name: 'Query team A',
        workspaceId,
      },
      {
        createdByUserId: userId,
        id: 'wq-team-b',
        key: 'WQB',
        name: 'Query team B',
        workspaceId,
      },
    ]);
    await serverDB.insert(teamMembers).values([
      { role: 'lead', teamId: 'wq-team-a', userId, workspaceId },
      { role: 'lead', teamId: 'wq-team-b', userId, workspaceId },
    ]);
    await serverDB.insert(projects).values({
      id: 'wq-shared-project',
      identifier: 'WQS',
      name: 'Shared project',
      userId,
      workspaceId,
    });
    await serverDB.insert(projectTeams).values([
      { projectId: 'wq-shared-project', teamId: 'wq-team-a', workspaceId },
      { projectId: 'wq-shared-project', teamId: 'wq-team-b', workspaceId },
    ]);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const linked = await model.queryProjects({
      query: {
        entityType: 'project',
        filter: { all: [{ field: 'teamId', op: 'isNotNull' }] },
        schemaVersion: 1,
      },
    });
    expect(linked.projects.map((row) => row.id)).toEqual(['wq-shared-project']);
    expect(linked.total).toBe(1);

    const fromA = await model.queryProjects({
      query: {
        entityType: 'project',
        filter: { all: [{ field: 'teamId', op: 'eq', value: 'wq-team-a' }] },
        schemaVersion: 1,
      },
    });
    const fromB = await model.queryProjects({
      query: {
        entityType: 'project',
        filter: { all: [{ field: 'teamId', op: 'eq', value: 'wq-team-b' }] },
        schemaVersion: 1,
      },
    });
    expect(fromA.projects.map((row) => row.id)).toEqual(['wq-shared-project']);
    expect(fromB.projects.map((row) => row.id)).toEqual(['wq-shared-project']);
  });

  it('hides private projects from search and lists unless the viewer has a grant', async () => {
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId, workspaceId },
      { role: 'member', userId: otherUserId, workspaceId },
    ]);
    await serverDB.insert(projects).values([
      {
        id: 'wq-public-project',
        identifier: 'WQP',
        name: 'Public fleet',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        id: 'wq-secret-project',
        identifier: 'WQS',
        name: 'Secret fleet',
        userId,
        visibility: 'private',
        workspaceId,
      },
    ]);

    const outsider = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    const emptyQuery = { entityType: 'project' as const, schemaVersion: 1 as const };
    expect((await outsider.searchProjects('fleet')).map((row) => row.id)).toEqual([
      'wq-public-project',
    ]);
    expect(
      (await outsider.queryProjects({ query: emptyQuery })).projects.map((row) => row.id),
    ).toEqual(['wq-public-project']);
    expect((await outsider.queryProjects({ query: emptyQuery })).total).toBe(1);

    await serverDB.insert(projectMembers).values({
      projectId: 'wq-secret-project',
      role: 'contributor',
      userId: otherUserId,
      workspaceId,
    });

    expect((await outsider.searchProjects('fleet')).map((row) => row.id).sort()).toEqual([
      'wq-public-project',
      'wq-secret-project',
    ]);
    expect(
      (await outsider.queryProjects({ query: emptyQuery })).projects.map((row) => row.id).sort(),
    ).toEqual(['wq-public-project', 'wq-secret-project']);
  });
});
