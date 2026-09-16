// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { tasks, users, workspaces } from '../../schemas';
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
