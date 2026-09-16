// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces } from '../../schemas';
import { TaskModel } from '../task';

const db = await getTestDB();
const userId = 'prerequisite-test-user';
const otherUser = 'prerequisite-other-user';
const model = new TaskModel(db, userId);
const create = (name: string) => model.create({ instruction: name, name });

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: otherUser }]);
});
afterEach(async () => {
  await db.delete(users);
});

describe('task prerequisites', () => {
  it('requires tasks 1 AND 2 before task 4 may start or complete', async () => {
    const one = await create('Task 1');
    const two = await create('Task 2');
    const four = await create('Task 4');
    await model.addDependency(four.id, one.id);
    await model.addDependency(four.id, two.id);
    await expect(model.reserveRun(four.id, 'blocked-attempt')).rejects.toThrow('prerequisite');
    await expect(model.updateStatus(four.id, 'completed')).rejects.toThrow('prerequisite');
    expect((await model.findById(four.id))?.status).toBe('backlog');
    await model.updateStatus(one.id, 'completed');
    await expect(model.getUnlockedTasks(one.id)).resolves.toEqual([]);
    await expect(model.reserveRun(four.id, 'still-blocked')).rejects.toThrow('prerequisite');
    await model.updateStatus(two.id, 'completed');
    await expect(model.getUnlockedTasks(two.id)).resolves.toEqual([
      expect.objectContaining({ id: four.id }),
    ]);
    await expect(model.reserveRun(four.id, 'ready-attempt')).resolves.toBe(true);
  });

  it.each(['canceled', 'failed'])('%s is not successful completion', async (status) => {
    const upstream = await create('Prerequisite');
    const downstream = await create('Dependent');
    await model.addDependency(downstream.id, upstream.id);
    await model.updateStatus(upstream.id, status);
    await expect(model.areAllDependenciesCompleted(downstream.id)).resolves.toBe(false);
    await expect(model.reserveRun(downstream.id, 'attempt')).rejects.toThrow('prerequisite');
  });

  it('does not block relates edges and safely upgrades them to prerequisites', async () => {
    const one = await create('One');
    const two = await create('Two');
    await model.addDependency(two.id, one.id, 'relates');
    await expect(model.areAllDependenciesCompleted(two.id)).resolves.toBe(true);
    await model.addDependency(two.id, one.id, 'blocks');
    await model.addDependency(two.id, one.id, 'blocks');
    const dependencies = await model.getDependencies(two.id);
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0].type).toBe('blocks');
    await expect(model.areAllDependenciesCompleted(two.id)).resolves.toBe(false);
  });

  it('rejects self, direct and transitive cycles', async () => {
    const one = await create('One');
    const two = await create('Two');
    const three = await create('Three');
    await expect(model.addDependency(one.id, one.id)).rejects.toThrow('itself');
    await model.addDependency(two.id, one.id);
    await expect(model.addDependency(one.id, two.id)).rejects.toThrow('cycle');
    await model.addDependency(three.id, two.id);
    await expect(model.addDependency(one.id, three.id)).rejects.toThrow('cycle');
  });

  it('serializes concurrent reverse edges so they cannot create a cycle', async () => {
    const one = await create('One');
    const two = await create('Two');
    const results = await Promise.allSettled([
      model.addDependency(one.id, two.id),
      model.addDependency(two.id, one.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('serializes an add-versus-start race without an invalid running task', async () => {
    const one = await create('One');
    const two = await create('Two');
    const results = await Promise.allSettled([
      model.addDependency(two.id, one.id),
      model.reserveRun(two.id, 'racing-attempt'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const task = await model.findById(two.id);
    if (task?.status === 'running') expect(await model.getDependencies(two.id)).toHaveLength(0);
    else await expect(model.areAllDependenciesCompleted(two.id)).resolves.toBe(false);
  });

  it('rejects changing prerequisites of a running task', async () => {
    const one = await create('One');
    const two = await create('Two');
    await model.reserveRun(two.id, 'live-attempt');
    await expect(model.addDependency(two.id, one.id)).rejects.toThrow('Pause or reopen');
  });

  it('protects plain, logged, conditional and bulk status paths', async () => {
    const one = await create('One');
    const two = await create('Two');
    await model.addDependency(two.id, one.id);
    await expect(model.update(two.id, { status: 'running' })).rejects.toThrow('prerequisite');
    await expect(model.updateWithLog(two.id, { status: 'completed' }, { userId })).rejects.toThrow(
      'prerequisite',
    );
    await expect(model.updateStatusIfCurrent(two.id, 'backlog', 'running')).rejects.toThrow(
      'prerequisite',
    );
    await expect(model.batchUpdateStatus([two.id], 'completed')).rejects.toThrow('prerequisite');
    await expect(model.updateStatusForIds([two.id], 'completed')).rejects.toThrow('prerequisite');
    expect((await model.findById(two.id))?.status).toBe('backlog');
  });

  it('completes a dependency family atomically, but never bypasses external prerequisites', async () => {
    const external = await create('External');
    const one = await create('One');
    const two = await create('Two');
    await model.addDependency(two.id, one.id);
    await model.addDependency(one.id, external.id);
    await expect(model.updateStatusForIds([one.id, two.id], 'completed')).rejects.toThrow(
      'prerequisite',
    );
    expect((await model.findById(two.id))?.status).toBe('backlog');
    await model.updateStatus(external.id, 'completed');
    const completed = await model.updateStatusForIds([one.id, two.id], 'completed');
    expect(completed).toHaveLength(2);
    expect(completed.every((task) => task.status === 'completed')).toBe(true);
  });

  it('re-blocks a waiting task when its prerequisite is reopened', async () => {
    const one = await create('One');
    const two = await create('Two');
    await model.addDependency(two.id, one.id);
    await model.updateStatus(one.id, 'completed');
    await expect(model.areAllDependenciesCompleted(two.id)).resolves.toBe(true);
    await model.updateStatus(one.id, 'backlog');
    await expect(model.reserveRun(two.id, 'attempt')).rejects.toThrow('prerequisite');
  });

  it('does not expose or accept tasks from another personal scope', async () => {
    const one = await create('One');
    const foreign = await new TaskModel(db, otherUser).create({
      instruction: 'Secret',
      name: 'Secret',
    });
    await expect(model.addDependency(one.id, foreign.id)).rejects.toThrow('Task not found');
    expect(await model.searchDependencyCandidates(one.id, 'Secret')).toEqual([]);
  });

  it('redacts a demoted prerequisite from candidates, blocks, and lets an editor unlink the edge', async () => {
    const workspaceId = 'prerequisite-workspace';
    await db
      .insert(workspaces)
      .values({ id: workspaceId, name: 'Workspace', primaryOwnerId: userId, slug: workspaceId });
    const owner = new TaskModel(db, userId, workspaceId);
    const member = new TaskModel(db, otherUser, workspaceId);
    const upstream = await owner.create({ instruction: 'Private later', visibility: 'public' });
    const downstream = await member.create({ instruction: 'Shared task', visibility: 'public' });
    await member.addDependency(downstream.id, upstream.id);
    await owner.updateVisibility(upstream.id, 'private');
    await expect(member.areAllDependenciesCompleted(downstream.id)).resolves.toBe(false);
    const [edge] = await member.getDependencies(downstream.id);
    await member.removeDependencyById(downstream.id, edge.id);
    await expect(member.areAllDependenciesCompleted(downstream.id)).resolves.toBe(true);
  });

  it('bounds candidate search, excludes self and existing blockers, and escapes wildcard queries', async () => {
    const one = await create('One');
    const two = await create('100% exact');
    const three = await create('Another task');
    expect(await model.searchDependencyCandidates(one.id, '%')).toEqual([
      expect.objectContaining({ id: two.id }),
    ]);
    expect(await model.searchDependencyCandidates(one.id, '', 1)).toHaveLength(1);
    await model.addDependency(one.id, two.id);
    const results = await model.searchDependencyCandidates(one.id, '');
    expect(results.map(({ id }) => id)).toEqual([three.id]);
  });
});
