// @vitest-environment node
import { and, eq, inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { agents, taskActivities, taskDependencies, tasks, users, workspaces } from '../../schemas';
import { TaskModel } from '../task';
import { TaskDependencyError } from '../taskDependency';

const db = await getTestDB();
const userId = 'prerequisites-user';
const otherUserId = 'prerequisites-other';
const model = new TaskModel(db, userId);
const create = (instruction: string) => model.create({ instruction });

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
});
afterEach(async () => {
  await db.delete(users);
});

describe('task prerequisite invariants', () => {
  it('requires BOTH Task 1 and Task 2 before reserving Task 4', async () => {
    const a = await create('Task 1');
    const b = await create('Task 2');
    const dependent = await create('Task 4');
    await model.addDependency(dependent.id, a.id);
    await model.addDependency(dependent.id, b.id);
    await expect(model.reserveRun(dependent.id, 'run-1')).rejects.toBeInstanceOf(
      TaskDependencyError,
    );
    await model.updateStatus(a.id, 'completed');
    await expect(model.reserveRun(dependent.id, 'run-1')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(await model.findById(dependent.id)).toMatchObject({
      status: 'backlog',
      runReservationId: null,
    });
    await model.updateStatus(b.id, 'completed');
    await expect(model.reserveRun(dependent.id, 'run-1')).resolves.toBe(true);
  });

  it('guards every status write and atomically rejects a blocked bulk write', async () => {
    const upstream = await create('Upstream');
    const dependent = await create('Dependent');
    const independent = await create('Independent');
    await model.addDependency(dependent.id, upstream.id);
    await db.update(tasks).set({ runReservationId: 'owner' }).where(eq(tasks.id, dependent.id));
    const writers = [
      () => model.update(dependent.id, { status: 'running' }),
      () => model.updateStatus(dependent.id, 'completed'),
      () => model.updateWithLog(dependent.id, { status: 'completed' }, { userId }),
      () => model.updateStatusIfCurrent(dependent.id, 'backlog', 'running'),
      () => model.updateStatusIfReservation(dependent.id, 'owner', 'backlog', 'completed'),
      () => model.batchUpdateStatus([independent.id, dependent.id], 'running'),
      () => model.updateStatusForIds([independent.id, dependent.id], 'completed'),
    ];
    for (const write of writers) {
      await expect(write()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect((await model.findById(dependent.id))?.status).toBe('backlog');
      expect((await model.findById(independent.id))?.status).toBe('backlog');
    }
    // A stale lifecycle callback is fenced, not reported as a dependency error.
    await expect(
      model.updateStatusIfReservation(dependent.id, 'stale', 'backlog', 'completed'),
    ).resolves.toBeNull();
    await expect(model.updateStatus(dependent.id, 'paused')).resolves.toMatchObject({
      status: 'paused',
    });
  });

  it.each(['canceled', 'failed', 'paused', 'scheduled', 'running'])(
    '%s does not satisfy a prerequisite',
    async (status) => {
      const upstream = await create('Upstream');
      const dependent = await create('Dependent');
      await model.addDependency(dependent.id, upstream.id);
      await model.updateStatus(upstream.id, status);
      await expect(model.areAllDependenciesCompleted(dependent.id)).resolves.toBe(false);
      await expect(model.getUnlockedTasks(upstream.id)).resolves.toEqual([]);
    },
  );

  it('rejects self dependencies and multi-hop cycles without changing the graph', async () => {
    const a = await create('A');
    const b = await create('B');
    const c = await create('C');
    await expect(model.addDependency(a.id, a.id)).rejects.toThrow('itself');
    await model.addDependency(b.id, a.id);
    await model.addDependency(c.id, b.id);
    await expect(model.addDependency(a.id, c.id)).rejects.toThrow('cycle');
    await expect(model.getDependencies(a.id)).resolves.toEqual([]);
  });

  it('serializes concurrent reciprocal edges', async () => {
    const a = await create('A');
    const b = await create('B');
    const outcomes = await Promise.allSettled([
      model.addDependency(a.id, b.id),
      model.addDependency(b.id, a.id),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('serializes adding an unfinished dependency against reservation', async () => {
    const a = await create('A');
    const b = await create('B');
    const outcomes = await Promise.allSettled([
      model.addDependency(b.id, a.id),
      model.reserveRun(b.id, 'run'),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await model.findById(b.id);
    const deps = await model.getDependencies(b.id);
    expect(after?.status === 'running' && deps.length > 0).toBe(false);
  });

  it('keeps relates nonblocking and validates promotion to blocks', async () => {
    const a = await create('A');
    const b = await create('B');
    await model.addDependency(a.id, b.id, 'relates');
    await model.addDependency(b.id, a.id, 'blocks');
    await expect(model.areAllDependenciesCompleted(a.id)).resolves.toBe(true);
    await expect(model.addDependency(a.id, b.id, 'blocks')).rejects.toThrow('cycle');
    await model.addDependency(b.id, a.id, 'blocks');
    expect(await model.getDependencies(b.id)).toHaveLength(1);
  });

  it('reblocks on reopen or trash and does not erase a blocker through deletion', async () => {
    const a = await create('A');
    const b = await create('B');
    await model.addDependency(b.id, a.id);
    await model.updateStatus(a.id, 'completed');
    await expect(model.areAllDependenciesCompleted(b.id)).resolves.toBe(true);
    await model.updateStatus(a.id, 'backlog');
    await expect(model.areAllDependenciesCompleted(b.id)).resolves.toBe(false);
    await model.update(a.id, { status: 'completed', deletedAt: new Date(), isDeleted: true });
    await expect(model.areAllDependenciesCompleted(b.id)).resolves.toBe(false);
    await expect(model.delete(a.id)).rejects.toThrow('dependency links');
    await model.removeDependency(b.id, a.id);
    await expect(model.delete(a.id)).resolves.toBe(true);
  });

  it('does not insert an unfinished prerequisite onto a running or completed task', async () => {
    const a = await create('A');
    const b = await create('B');
    for (const status of ['running', 'completed']) {
      await model.updateStatus(b.id, status);
      await expect(model.addDependency(b.id, a.id)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
    }
  });

  it('does not accept an inaccessible task from another owner', async () => {
    const other = new TaskModel(db, otherUserId);
    const a = await other.create({ instruction: 'Private' });
    const b = await create('Dependent');
    await expect(model.addDependency(b.id, a.id)).rejects.toThrow('unavailable');
  });

  it("keeps edges on the caller's own unfiled tasks visible in workspace mode", async () => {
    const workspaceId = 'prerequisite-unfiled-workspace';
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Unfiled prerequisites',
      slug: workspaceId,
      primaryOwnerId: userId,
    });
    // Rows written before workspaces became mandatory carry no workspace_id;
    // the workspace-scoped read must still see their dependency edges.
    const upstream = await create('Unfiled upstream');
    const dependent = await create('Unfiled dependent');
    await model.addDependency(dependent.id, upstream.id);
    const scoped = new TaskModel(db, userId, workspaceId);
    expect(await scoped.findById(dependent.id)).not.toBeNull();
    expect(await scoped.getDependencies(dependent.id)).toHaveLength(1);
    expect(await scoped.areAllDependenciesCompleted(dependent.id)).toBe(false);
    await scoped.updateStatus(upstream.id, 'completed');
    expect(await scoped.areAllDependenciesCompleted(dependent.id)).toBe(true);
  });

  it('fails closed after visibility changes while allowing the dependent owner to remove the edge', async () => {
    const workspaceId = 'prerequisite-workspace';
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Prerequisites',
      slug: workspaceId,
      primaryOwnerId: userId,
    });
    const owner = new TaskModel(db, userId, workspaceId);
    const member = new TaskModel(db, otherUserId, workspaceId);
    const upstream = await owner.create({ instruction: 'Shared', status: 'completed' });
    const dependent = await member.create({ instruction: 'Dependent' });
    await member.addDependency(dependent.id, upstream.id);
    await owner.updateVisibility(upstream.id, 'private');
    await expect(member.areAllDependenciesCompleted(dependent.id)).resolves.toBe(false);
    await member.removeDependency(dependent.id, upstream.id);
    await expect(member.areAllDependenciesCompleted(dependent.id)).resolves.toBe(true);
  });
});

describe('prerequisite review regressions', () => {
  const workspace = async () => {
    const workspaceId = 'prerequisite-review-workspace';
    await db.insert(workspaces).values({
      id: workspaceId,
      name: 'Review',
      slug: workspaceId,
      primaryOwnerId: userId,
    });
    return {
      owner: new TaskModel(db, userId, workspaceId),
      member: new TaskModel(db, otherUserId, workspaceId),
    };
  };

  it('keeps legacy member-authored edges visible to the dependent owner after demotion', async () => {
    const { owner, member } = await workspace();
    const upstream = await owner.create({ instruction: 'Upstream' });
    const dependent = await owner.create({ instruction: 'Shared dependent' });
    await member.addDependency(dependent.id, upstream.id);
    expect((await owner.getDependencies(dependent.id))[0].userId).toBe(userId);
    await db
      .update(taskDependencies)
      .set({ userId: otherUserId })
      .where(eq(taskDependencies.taskId, dependent.id));
    await owner.updateVisibility(dependent.id, 'private');
    expect(await owner.getDependencies(dependent.id)).toHaveLength(1);
    expect(await member.getDependencies(dependent.id)).toEqual([]);
    await expect(owner.reserveRun(dependent.id, 'blocked')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(owner.updateStatus(dependent.id, 'completed')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await owner.removeDependency(dependent.id, upstream.id);
    expect(await owner.getDependencies(dependent.id)).toEqual([]);
  });

  it('evaluates mixed-visibility readiness in the dependent owner scope regardless of the last completer', async () => {
    const { owner, member } = await workspace();
    const privateTask = await owner.create({
      instruction: 'Private upstream',
      visibility: 'private',
    });
    const publicTask = await member.create({ instruction: 'Public upstream' });
    const dependent = await owner.create({ instruction: 'Shared dependent' });
    await owner.addDependency(dependent.id, privateTask.id);
    await owner.addDependency(dependent.id, publicTask.id);
    await owner.updateStatus(privateTask.id, 'completed');
    expect(await owner.getUnlockedTasks(privateTask.id)).toEqual([]);
    await member.updateStatus(publicTask.id, 'completed');
    expect((await member.getUnlockedTasks(publicTask.id)).map(({ id }) => id)).toEqual([
      dependent.id,
    ]);
    expect(await member.areAllDependenciesCompleted(dependent.id)).toBe(false);
    expect(await owner.areAllDependenciesCompleted(dependent.id)).toBe(true);
  });

  it('rejects creator-only clear-all when another creator has a surviving dependent', async () => {
    const { owner, member } = await workspace();
    const upstream = await owner.create({ instruction: 'Upstream' });
    const unrelated = await owner.create({ instruction: 'Unrelated' });
    const dependent = await member.create({ instruction: 'Surviving dependent' });
    await member.addDependency(dependent.id, upstream.id);
    await expect(owner.deleteAll({ restrictToCreator: true })).rejects.toThrow('dependency links');
    expect(await owner.findById(upstream.id)).not.toBeNull();
    expect(await owner.findById(unrelated.id)).not.toBeNull();
    expect(await member.areAllDependenciesCompleted(dependent.id)).toBe(false);
    expect(await member.getDependencies(dependent.id)).toHaveLength(1);
  });

  it('allows deleting a complete internal dependency set atomically', async () => {
    const upstream = await create('Upstream');
    const dependent = await create('Dependent');
    await model.addDependency(dependent.id, upstream.id);
    expect(await model.deleteAll()).toBe(2);
    expect((await model.list()).total).toBe(0);
  });

  it('does not erase surviving blockers through subtree deletion', async () => {
    const root = await create('Root');
    const child = await model.create({ instruction: 'Child', parentTaskId: root.id });
    const external = await create('External');
    await model.addDependency(external.id, child.id);
    await expect(model.deleteSubtree(root.id)).rejects.toThrow('dependency links');
    expect(await model.findById(root.id)).not.toBeNull();
    expect(await model.findById(child.id)).not.toBeNull();
  });

  it('fences deferred heartbeat writes by token, status, mode and interval while preserving counters', async () => {
    const task = await model.create({
      instruction: 'Heartbeat',
      status: 'scheduled',
      automationMode: 'heartbeat',
      heartbeatInterval: 600,
      context: { scheduler: { tickToken: 'old', consecutiveFailures: 2 } },
    });
    const patch = {
      tickToken: 'next',
      tickMessageId: 'message',
      scheduledAt: new Date().toISOString(),
    };
    expect(await model.updateContextIfHeartbeatTick(task.id, 'stale', 600, patch)).toBe(false);
    expect(await model.updateContextIfHeartbeatTick(task.id, 'old', 900, patch)).toBe(false);
    expect(await model.updateContextIfHeartbeatTick(task.id, 'old', 600, patch)).toBe(true);
    expect((await model.findById(task.id))?.context).toMatchObject({
      scheduler: { ...patch, consecutiveFailures: 2 },
    });
    expect(await model.updateContextIfHeartbeatTick(task.id, 'old', 600, patch)).toBe(false);
    await model.updateStatus(task.id, 'paused');
    expect(await model.updateContextIfHeartbeatTick(task.id, 'next', 600, patch)).toBe(false);
    await model.update(task.id, { status: 'scheduled', automationMode: 'schedule' });
    expect(await model.updateContextIfHeartbeatTick(task.id, 'next', 600, patch)).toBe(false);
  });
});

describe('dependency activity feed', () => {
  const relationRows = async (...taskIds: string[]) =>
    db
      .select()
      .from(taskActivities)
      .where(and(inArray(taskActivities.taskId, taskIds), eq(taskActivities.type, 'relation')));

  it('writes a denormalized relation row on both issues for add and remove', async () => {
    const blocker = await create('Blocker');
    const dependent = await create('Dependent');

    await model.addDependency(dependent.id, blocker.id, 'blocks');

    let rows = await relationRows(dependent.id, blocker.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.taskId === dependent.id)?.payload).toMatchObject({
      actorKind: 'user',
      relationAction: 'added',
      relationDirection: 'blockedBy',
      relationKind: 'blocks',
      relationTargetIdentifier: blocker.identifier,
      relationTargetTaskId: blocker.id,
    });
    expect(rows.find((r) => r.taskId === blocker.id)?.payload).toMatchObject({
      relationAction: 'added',
      relationDirection: 'blocking',
      relationKind: 'blocks',
      relationTargetTaskId: dependent.id,
    });
    expect(rows.every((r) => r.actorUserId === userId)).toBe(true);

    await model.removeDependency(dependent.id, blocker.id);

    rows = await relationRows(dependent.id, blocker.id);
    expect(rows).toHaveLength(4);
    const removed = rows.filter((r) => r.payload?.relationAction === 'removed');
    expect(removed).toHaveLength(2);
    expect(removed.map((r) => r.taskId).sort()).toEqual([blocker.id, dependent.id].sort());
  });

  it('records relates edges without a direction and attributes agent actors', async () => {
    const agentId = 'relation-feed-agent';
    await db.insert(agents).values({ id: agentId, slug: agentId, userId });
    const a = await create('Left');
    const b = await create('Right');

    await model.addDependency(a.id, b.id, 'relates', { actor: { agentId } });

    const rows = await relationRows(a.id, b.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.actorAgentId).toBe(agentId);
      expect(row.payload).toMatchObject({
        actorKind: 'agent',
        relationAction: 'added',
        relationKind: 'relates',
      });
      expect(row.payload?.relationDirection).toBeUndefined();
    }
  });
});
