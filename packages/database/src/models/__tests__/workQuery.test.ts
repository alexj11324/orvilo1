// @vitest-environment node
import {
  applyDelegatedFilter,
  applyNoProjectFilter,
  WORK_QUERY_MAX_IN_VALUES,
  type WorkQueryPredicate,
} from '@orvilo/types';
import { eq, inArray } from 'drizzle-orm';
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
import { notifications } from '../../schemas/notification';
import { taskDependencies, tasks as tasksTable } from '../../schemas/task';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import { TaskLabelModel } from '../taskLabel';
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

  it('activity lists only tasks with real notification activity, most recent first', async () => {
    const recent = await createTask(otherUserId, { name: 'Recent ping' });
    const stale = await createTask(otherUserId, { name: 'Older ping' });
    // Assigned to me but no notification episode — relation alone is not activity.
    const silent = await createTask(otherUserId, { assigneeUserId: userId, name: 'Silent' });
    const foreign = await createTask(otherUserId, { name: 'Someone else pinged' });

    const ping = (resourceId: string, at: string, user: string = userId) => ({
      category: 'work',
      content: 'x',
      lastActivityAt: new Date(at),
      resourceId,
      resourceType: 'task',
      title: 'x',
      type: 'task.assigned',
      userId: user,
      workspaceId,
    });
    await serverDB.insert(notifications).values([
      ping(stale.id, '2026-09-01T00:00:00Z'),
      ping(recent.id, '2026-09-10T00:00:00Z'),
      ping(foreign.id, '2026-09-11T00:00:00Z', otherUserId),
      // A non-task resource for the same user must not pull the task in.
      {
        category: 'work',
        content: 'x',
        lastActivityAt: new Date('2026-09-12T00:00:00Z'),
        resourceId: stale.id,
        resourceType: 'project',
        title: 'x',
        type: 'project.updated',
        userId,
        workspaceId,
      },
    ]);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const result = await model.queryTasks({
      mode: 'activity',
      query: myWorkQueryForMode('activity'),
    });

    const ids = result.tasks.map((row) => row.id);
    expect(ids).toEqual([recent.id, stale.id]);
    expect(ids).not.toContain(silent.id);
    expect(ids).not.toContain(foreign.id);

    // Keyset pagination follows the same activity ordering.
    const second = await model.queryTasks({
      afterId: recent.id,
      mode: 'activity',
      query: myWorkQueryForMode('activity'),
      queryHash: result.queryHash,
    });
    expect(second.tasks.map((row) => row.id)).toEqual([stale.id]);
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
    // Activity is notification-backed now — only the delegated task has an
    // episode for the caller; the assigned-only task stays silent.
    await serverDB.insert(notifications).values({
      category: 'work',
      content: 'x',
      resourceId: delegated.id,
      resourceType: 'task',
      title: 'x',
      type: 'task.assigned',
      userId,
      workspaceId,
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

  it('groups an assigned list by attention — urgent, then blocking, then status', async () => {
    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    // An urgent blocker lands in 'urgent' only — Linear's first bucket wins.
    const urgentBlocker = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Urgent blocker',
      priority: 1,
      status: 'running',
    });
    const blocker = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Plain blocker',
      status: 'running',
    });
    const blocked = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Blocked backlog',
      status: 'backlog',
    });
    const doneBlocked = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Freed task',
      status: 'completed',
    });
    const normal = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Ordinary paused',
      status: 'paused',
    });
    // The urgent blocker also blocks an open task — it must stay in 'urgent'.
    // `blocker` blocks `blocked`; `urgentBlocker`'s finished dependent is done
    // but its second edge targets an open row... kept simple: urgentBlocker
    // blocks `blocked` too; `blocker` also blocks the completed row, which
    // must NOT count.
    await serverDB.insert(taskDependencies).values([
      {
        dependsOnId: urgentBlocker.id,
        taskId: blocked.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        dependsOnId: blocker.id,
        taskId: blocked.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        dependsOnId: urgentBlocker.id,
        taskId: doneBlocked.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        dependsOnId: normal.id,
        taskId: doneBlocked.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
    ]);

    const query = applyWorkQueryLayout(myWorkQueryForMode('assigned'), 'list', 'attention');
    const result = await model.queryTasks({ limit: 10, query });

    expect(result.groupBy).toBe('attention');
    const populated = result.groups!.filter((group) => group.total > 0);
    expect(populated.map((group) => group.key)).toEqual([
      'urgent',
      'blocking',
      'backlog',
      'paused',
      'completed',
    ]);
    const byKey = new Map(result.groups!.map((group) => [group.key, group]));
    expect(byKey.get('urgent')?.tasks.map((task) => task.id)).toEqual([urgentBlocker.id]);
    expect(byKey.get('blocking')?.tasks.map((task) => task.id)).toEqual([blocker.id]);
    expect(byKey.get('backlog')?.tasks.map((task) => task.id)).toEqual([blocked.id]);
    // `normal` blocks only a completed task — not a Linear "blocking issue".
    expect(byKey.get('paused')?.tasks.map((task) => task.id)).toEqual([normal.id]);
    expect(byKey.get('completed')?.tasks.map((task) => task.id)).toEqual([doneBlocked.id]);
  });

  it('keeps terminal rows and unreadable downstreams out of attention buckets', async () => {
    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    // A completed urgent issue is not an "Urgent issue" — terminal rows stay
    // in their status bucket.
    const urgentDone = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Shipped urgent',
      priority: 1,
      status: 'completed',
    });
    // A completed blocker no longer holds the edge — finished work does not
    // surface as "Blocking issues".
    const doneBlocker = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Retired blocker',
      status: 'completed',
    });
    const open = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Still open',
      status: 'backlog',
    });
    // A blocker whose only downstream is invisible to the caller must NOT be
    // promoted — an unreadable task cannot change what the caller sees.
    const hiddenDownstream = await createTask(otherUserId, {
      name: 'Other member private task',
      status: 'backlog',
      visibility: 'private',
    });
    const blockerOfHidden = await createTask(userId, {
      assigneeUserId: userId,
      name: 'Blocks hidden task',
      status: 'running',
    });
    await serverDB.insert(taskDependencies).values([
      {
        dependsOnId: doneBlocker.id,
        taskId: open.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        dependsOnId: blockerOfHidden.id,
        taskId: hiddenDownstream.id,
        type: 'blocks',
        userId,
        visibility: 'public',
        workspaceId,
      },
    ]);

    const query = applyWorkQueryLayout(myWorkQueryForMode('assigned'), 'list', 'attention');
    const result = await model.queryTasks({ limit: 10, query });
    const byKey = new Map(result.groups!.map((group) => [group.key, group]));

    expect(byKey.get('urgent')?.total ?? 0).toBe(0);
    expect(byKey.get('blocking')?.total ?? 0).toBe(0);
    expect(
      byKey
        .get('completed')
        ?.tasks.map((task) => task.id)
        .sort(),
    ).toEqual([doneBlocker.id, urgentDone.id].sort());
    expect(byKey.get('running')?.tasks.map((task) => task.id)).toEqual([blockerOfHidden.id]);
    // The private downstream row itself never leaks into the caller's list.
    expect(result.groups!.flatMap((group) => group.tasks.map((task) => task.id))).not.toContain(
      hiddenDownstream.id,
    );
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

  it('boards projects by real status columns with per-column totals', async () => {
    await serverDB.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
    await serverDB.insert(projects).values([
      {
        id: 'wq-board-a',
        identifier: 'WBA',
        name: 'Board alpha',
        status: 'active',
        userId,
        workspaceId,
      },
      {
        id: 'wq-board-b',
        identifier: 'WBB',
        name: 'Board beta',
        status: 'active',
        userId,
        workspaceId,
      },
      {
        id: 'wq-board-c',
        identifier: 'WBC',
        name: 'Board gamma',
        status: 'paused',
        userId,
        workspaceId,
      },
    ]);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const result = await model.queryProjects({
      query: { entityType: 'project', layout: 'board', schemaVersion: 1 },
    });
    const active = result.projectGroups?.find((group) => group.key === 'active');
    const paused = result.projectGroups?.find((group) => group.key === 'paused');
    expect(result.groupBy).toBe('status');
    expect(active?.total).toBe(2);
    expect(active?.projects.map((row) => row.id).sort()).toEqual(['wq-board-a', 'wq-board-b']);
    expect(paused?.total).toBe(1);
    // Every status column is rendered even when empty — Linear keeps the board
    // visible rather than collapsing to populated states only.
    expect(result.projectGroups?.map((group) => group.key)).toContain('backlog');
    expect(result.projects).toHaveLength(3);
  });

  it('honours project sort by name and rejects a task-only groupBy', async () => {
    await serverDB.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
    await serverDB.insert(projects).values([
      { id: 'wq-sort-a', identifier: 'WSA', name: 'Zulu', userId, workspaceId },
      { id: 'wq-sort-b', identifier: 'WSB', name: 'Alpha', userId, workspaceId },
    ]);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const sorted = await model.queryProjects({
      query: {
        entityType: 'project',
        schemaVersion: 1,
        sort: [{ direction: 'asc', field: 'name' }],
      },
    });
    expect(sorted.projects.map((row) => row.name)).toEqual(['Alpha', 'Zulu']);

    await expect(
      model.queryProjects({
        query: { entityType: 'project', groupBy: 'workflowCategory', schemaVersion: 1 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  });

  it('filters projects by ownerUserId and visibility predicates', async () => {
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId, workspaceId },
      { role: 'member', userId: otherUserId, workspaceId },
    ]);
    await serverDB.insert(projects).values([
      {
        id: 'wq-filter-mine',
        identifier: 'WFM',
        name: 'Mine',
        userId,
        visibility: 'public',
        workspaceId,
      },
      {
        id: 'wq-filter-theirs',
        identifier: 'WFT',
        name: 'Theirs',
        userId: otherUserId,
        visibility: 'public',
        workspaceId,
      },
      {
        id: 'wq-filter-private',
        identifier: 'WFP',
        name: 'Mine private',
        userId,
        visibility: 'private',
        workspaceId,
      },
    ]);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const owned = await model.queryProjects({
      query: {
        entityType: 'project',
        filter: { all: [{ field: 'ownerUserId', op: 'eq', value: { ref: 'currentUser' } }] },
        schemaVersion: 1,
      },
    });
    expect(owned.projects.map((row) => row.id).sort()).toEqual([
      'wq-filter-mine',
      'wq-filter-private',
    ]);

    const publicOnly = await model.queryProjects({
      query: {
        entityType: 'project',
        filter: { all: [{ field: 'visibility', op: 'eq', value: 'public' }] },
        schemaVersion: 1,
      },
    });
    expect(publicOnly.projects.map((row) => row.id).sort()).toEqual([
      'wq-filter-mine',
      'wq-filter-theirs',
    ]);
  });

  it('created lists newest-created first even when another row was touched later', async () => {
    const filedFirst = await createTask(userId, { name: 'Filed first' });
    const filedLater = await createTask(userId, { name: 'Filed later' });
    await serverDB
      .update(tasksTable)
      .set({
        createdAt: new Date('2026-09-01T00:00:00Z'),
        updatedAt: new Date('2026-09-19T00:00:00Z'),
      })
      .where(eq(tasksTable.id, filedFirst.id));
    await serverDB
      .update(tasksTable)
      .set({
        createdAt: new Date('2026-09-15T00:00:00Z'),
        updatedAt: new Date('2026-09-02T00:00:00Z'),
      })
      .where(eq(tasksTable.id, filedLater.id));

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      query: myWorkQueryForMode('created'),
    });

    // updatedAt-desc would put filedFirst first; createdAt-desc must win.
    expect(result.tasks.map((row) => row.id)).toEqual([filedLater.id, filedFirst.id]);
  });

  it('evaluates a top-level any group as OR across all four quadrants (VW01)', async () => {
    // Seed the acceptance matrix: only A, only B, both, neither.
    const onlyPriority = await createTask(otherUserId, { name: 'Urgent not mine', priority: 3 });
    const onlyAssignee = await createTask(otherUserId, {
      assigneeUserId: userId,
      name: 'Mine not urgent',
      priority: 0,
    });
    const both = await createTask(otherUserId, {
      assigneeUserId: userId,
      name: 'Urgent and mine',
      priority: 3,
    });
    const neither = await createTask(otherUserId, { name: 'Neither', priority: 0 });

    const result = await new WorkQueryModel(serverDB, userId, workspaceId).queryTasks({
      query: {
        entityType: 'task',
        filter: {
          any: [
            { field: 'priority', op: 'eq', value: 3 },
            { field: 'assigneeUserId', op: 'eq', value: { ref: 'currentUser' } },
          ],
        },
        schemaVersion: 1,
        sort: [{ direction: 'asc', field: 'name' }],
      },
    });

    expect(result.tasks.map((row) => row.id).sort()).toEqual(
      [onlyPriority.id, onlyAssignee.id, both.id].sort(),
    );
    expect(result.tasks.map((row) => row.id)).not.toContain(neither.id);
    expect(result.total).toBe(3);
  });

  it('board columns keep manual positions unless sortMode is field (VW03)', async () => {
    // Positions deliberately contradict name order.
    const zebra = await createTask(userId, { name: 'Zebra', workflowCategory: 'todo' });
    const alpha = await createTask(userId, { name: 'Alpha', workflowCategory: 'todo' });
    const mid = await createTask(userId, { name: 'Mid', workflowCategory: 'todo' });
    await serverDB.update(tasksTable).set({ position: 1 }).where(eq(tasksTable.id, zebra.id));
    await serverDB.update(tasksTable).set({ position: 2 }).where(eq(tasksTable.id, mid.id));
    await serverDB.update(tasksTable).set({ position: 3 }).where(eq(tasksTable.id, alpha.id));

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const board = {
      entityType: 'task' as const,
      filter: {
        all: [{ field: 'id' as const, op: 'in' as const, value: [zebra.id, alpha.id, mid.id] }],
      },
      groupBy: 'workflowCategory' as const,
      layout: 'board' as const,
      schemaVersion: 1 as const,
      sort: [{ direction: 'asc' as const, field: 'name' as const }],
    };

    // Unset and explicit manual both order by position — drag persistence.
    for (const query of [board, { ...board, sortMode: 'manual' as const }]) {
      const manual = await model.queryTasks({ query });
      const todo = manual.groups?.find((group) => group.key === 'todo');
      expect(manual.layout).toBe('board');
      expect(todo?.tasks.map((row) => row.name)).toEqual(['Zebra', 'Mid', 'Alpha']);
    }

    // Field mode orders each column by the saved sort.
    const field = await model.queryTasks({ limit: 2, query: { ...board, sortMode: 'field' } });
    const todo = field.groups?.find((group) => group.key === 'todo');
    expect(todo?.tasks.map((row) => row.name)).toEqual(['Alpha', 'Mid']);

    // Field mode paginates by the same sort, not by position.
    const next = await model.queryTasks({
      afterId: todo!.tasks[1]!.id,
      groupKey: 'todo',
      limit: 2,
      query: { ...board, sortMode: 'field' },
      queryHash: field.queryHash,
    });
    expect(
      next.groups?.find((group) => group.key === 'todo')?.tasks.map((row) => row.name),
    ).toEqual(['Zebra']);
  });

  it('project options search server-side, page by cursor, and hydrate by id (VW04)', async () => {
    await serverDB.insert(workspaceMembers).values([
      { role: 'owner', userId, workspaceId },
      { role: 'member', userId: otherUserId, workspaceId },
    ]);
    // Distinct updatedAt values keep the keyset cursor deterministic on real
    // Postgres (timestamps are µs-precise; equal timestamps would rely on the
    // id tie-breaker hitting an eq-boundary).
    await serverDB.insert(projects).values([
      {
        id: 'wq-opt-a',
        identifier: 'WOA',
        name: 'Alpha deck',
        updatedAt: new Date('2026-09-10T00:00:00Z'),
        userId,
        workspaceId,
      },
      {
        id: 'wq-opt-b',
        identifier: 'WOB',
        name: 'Beta deck',
        updatedAt: new Date('2026-09-11T00:00:00Z'),
        userId,
        workspaceId,
      },
      {
        id: 'wq-opt-c',
        identifier: 'WOC',
        name: 'Gamma deck',
        updatedAt: new Date('2026-09-12T00:00:00Z'),
        userId,
        workspaceId,
      },
      {
        id: 'wq-opt-d',
        identifier: 'WOD',
        name: 'Delta private',
        updatedAt: new Date('2026-09-13T00:00:00Z'),
        userId,
        visibility: 'private',
        workspaceId,
      },
    ]);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);

    // Cursor pagination reaches past the first page — the old limit=100 load
    // could not see it.
    const first = await model.searchProjectOptions({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await model.searchProjectOptions({ afterId: first.nextCursor!, limit: 2 });
    const paged = [...first.items, ...second.items].map((item) => item.id).sort();
    expect(paged).toEqual(['wq-opt-a', 'wq-opt-b', 'wq-opt-c', 'wq-opt-d'].sort());
    expect(second.nextCursor).toBeNull();

    // Server-side name match — "project 101" is findable without loading all.
    const searched = await model.searchProjectOptions({ needle: 'gamma' });
    expect(searched.items.map((item) => item.id)).toEqual(['wq-opt-c']);

    // Selected values hydrate by id even when not on the loaded page.
    const hydrated = await model.searchProjectOptions({ ids: ['wq-opt-c'] });
    expect(hydrated.items.map((item) => item.name)).toEqual(['Gamma deck']);

    // Same ACL as project lists: outsiders never see the private row.
    const outsider = new WorkQueryModel(serverDB, otherUserId, workspaceId);
    const outsiderPage = await outsider.searchProjectOptions({ limit: 10 });
    expect(outsiderPage.items.map((item) => item.id)).not.toContain('wq-opt-d');
    const outsiderHydrate = await outsider.searchProjectOptions({ ids: ['wq-opt-d'] });
    expect(outsiderHydrate.items).toEqual([]);
  });

  it('cycle options stay in one query and scope to the chosen readable team (VW04)', async () => {
    await serverDB.insert(teams).values([
      {
        createdByUserId: userId,
        id: 'wq-cyc-public',
        key: 'CPA',
        name: 'Cycles public',
        visibility: 'public',
        workspaceId,
      },
      {
        createdByUserId: userId,
        id: 'wq-cyc-member',
        key: 'CMB',
        name: 'Cycles member',
        visibility: 'private',
        workspaceId,
      },
      {
        createdByUserId: userId,
        id: 'wq-cyc-secret',
        key: 'CSC',
        name: 'Cycles secret',
        visibility: 'private',
        workspaceId,
      },
    ]);
    await serverDB.insert(teamMembers).values({
      role: 'member',
      teamId: 'wq-cyc-member',
      userId,
      workspaceId,
    });
    const [cycleA, cycleB, cycleC] = await serverDB
      .insert(teamCycles)
      .values([
        { name: 'Public cycle', teamId: 'wq-cyc-public', workspaceId },
        { name: 'Member cycle', teamId: 'wq-cyc-member', workspaceId },
        { name: 'Secret cycle', teamId: 'wq-cyc-secret', workspaceId },
      ])
      .returning();

    const model = new WorkQueryModel(serverDB, userId, workspaceId);

    // No team scope → one authorized query across readable teams, not N calls.
    const all = await model.listCycleOptions({});
    expect(all.map((row) => row.id).sort()).toEqual([cycleA!.id, cycleB!.id].sort());
    expect(all.map((row) => row.id)).not.toContain(cycleC!.id);

    // Scoped to the selected team.
    const scoped = await model.listCycleOptions({ teamId: 'wq-cyc-member' });
    expect(scoped.map((row) => row.name)).toEqual(['Member cycle']);
    expect(scoped[0]?.teamName).toBe('Cycles member');

    // An unreadable scope returns nothing rather than leaking ids.
    expect(await model.listCycleOptions({ teamId: 'wq-cyc-secret' })).toEqual([]);

    // Hydrate a selected cycle by id.
    const hydrated = await model.listCycleOptions({ ids: [cycleB!.id] });
    expect(hydrated.map((row) => row.name)).toEqual(['Member cycle']);

    // Name needle narrows within the readable set.
    const searched = await model.listCycleOptions({ needle: 'public' });
    expect(searched.map((row) => row.id)).toEqual([cycleA!.id]);
  });
});

describe('labelId predicates', () => {
  const labelQuery = (predicate: Omit<WorkQueryPredicate, 'field'>) => ({
    entityType: 'task' as const,
    filter: { all: [{ field: 'labelId' as const, ...predicate }] },
    schemaVersion: 1 as const,
  });

  it('eq / neq / in / notIn match through bindings without duplicating rows', async () => {
    const labels = new TaskLabelModel(serverDB, userId, workspaceId);
    const bug = await labels.create({ name: 'Bug' });
    const urgent = await labels.create({ name: 'Urgent' });

    const both = await createTask(userId, { name: 'Two labels' });
    await labels.assign(both.id, bug.id);
    await labels.assign(both.id, urgent.id);
    const single = await createTask(userId, { name: 'One label' });
    await labels.assign(single.id, bug.id);
    const bare = await createTask(userId, { name: 'No labels' });

    const model = new WorkQueryModel(serverDB, userId, workspaceId);

    const eq = await model.queryTasks({ query: labelQuery({ op: 'eq', value: bug.id }) });
    expect(eq.tasks.map((row) => row.id).sort()).toEqual([both.id, single.id].sort());
    // Multi-labeled tasks come back exactly once — the predicate is an
    // EXISTS, not a join.
    expect(eq.tasks.filter((row) => row.id === both.id)).toHaveLength(1);

    const neq = await model.queryTasks({ query: labelQuery({ op: 'neq', value: bug.id }) });
    expect(neq.tasks.map((row) => row.id)).toContain(bare.id);
    expect(neq.tasks.map((row) => row.id)).not.toContain(both.id);
    expect(neq.tasks.map((row) => row.id)).not.toContain(single.id);

    const inList = await model.queryTasks({
      query: labelQuery({ op: 'in', value: [urgent.id] }),
    });
    expect(inList.tasks.map((row) => row.id)).toEqual([both.id]);

    const notIn = await model.queryTasks({
      query: labelQuery({ op: 'notIn', value: [bug.id, urgent.id] }),
    });
    expect(notIn.tasks.map((row) => row.id)).toContain(bare.id);
    expect(notIn.tasks.map((row) => row.id)).not.toContain(both.id);
  });

  it('isNull / isNotNull answer "has any label"', async () => {
    const labels = new TaskLabelModel(serverDB, userId, workspaceId);
    const bug = await labels.create({ name: 'Bug' });
    const tagged = await createTask(userId, { name: 'Tagged' });
    await labels.assign(tagged.id, bug.id);
    const bare = await createTask(userId, { name: 'Bare' });

    const model = new WorkQueryModel(serverDB, userId, workspaceId);

    const unlabeled = await model.queryTasks({ query: labelQuery({ op: 'isNull' }) });
    expect(unlabeled.tasks.map((row) => row.id)).toContain(bare.id);
    expect(unlabeled.tasks.map((row) => row.id)).not.toContain(tagged.id);

    const labeled = await model.queryTasks({ query: labelQuery({ op: 'isNotNull' }) });
    expect(labeled.tasks.map((row) => row.id)).toEqual([tagged.id]);
  });

  it('hydrates row labels and rejects labelId as a sort field', async () => {
    const labels = new TaskLabelModel(serverDB, userId, workspaceId);
    const bug = await labels.create({ color: '#ff0000', name: 'Bug' });
    const task = await createTask(userId, { name: 'Labeled row' });
    await labels.assign(task.id, bug.id);

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const result = await model.queryTasks({
      query: labelQuery({ op: 'eq', value: bug.id }),
    });
    expect(result.tasks[0]?.labels).toEqual([{ color: '#ff0000', id: bug.id, name: 'Bug' }]);

    await expect(
      model.queryTasks({
        query: {
          ...labelQuery({ op: 'isNotNull' }),
          sort: [
            { direction: 'asc' as const, field: 'labelId' as const },
            { direction: 'asc' as const, field: 'id' as const },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUERY' });
  });

  it('a foreign-scope label id matches nothing', async () => {
    await serverDB.insert(workspaces).values({
      id: 'wq-foreign-ws',
      name: 'Foreign WS',
      primaryOwnerId: otherUserId,
      slug: 'wq-foreign-ws',
    });
    const foreign = await new TaskLabelModel(serverDB, otherUserId, 'wq-foreign-ws').create({
      name: 'Foreign',
    });
    const task = await createTask(userId, { name: 'Local' });
    await new TaskLabelModel(serverDB, userId, workspaceId).assign(
      task.id,
      (await new TaskLabelModel(serverDB, userId, workspaceId).create({ name: 'Local label' })).id,
    );

    const model = new WorkQueryModel(serverDB, userId, workspaceId);
    const result = await model.queryTasks({
      query: labelQuery({ op: 'eq', value: foreign.id }),
    });
    expect(result.tasks).toHaveLength(0);
  });
});
