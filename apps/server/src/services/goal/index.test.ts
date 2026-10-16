// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { GoalModel } from '@/database/models/goal';
import { GoalGraphModel } from '@/database/models/goalGraph';
import {
  agentOperations,
  goalEdges,
  goalEvents,
  goalNodes,
  goals,
  tasks,
  users,
} from '@/database/schemas';

import { GoalService } from './index';

const db = await getTestDB();
const userId = 'goal-retirement-user';
const snapshot = async () =>
  Promise.all(
    [goals, goalNodes, goalEdges, goalEvents, tasks, agentOperations].map((table) =>
      db.select().from(table),
    ),
  );

beforeEach(async () => {
  await db.delete(users);
  await db.insert(users).values({ id: userId });
});
afterEach(async () => {
  await db.delete(users);
});

describe('retired standalone Goal writers', () => {
  it('rejects creation without creating any Goal, task, operation or causal ledger rows', async () => {
    const before = await snapshot();
    await expect(
      new GoalService(db, userId).create({ title: 'No standalone work' }),
    ).rejects.toThrow('Standalone Goal execution is unavailable');
    expect(await snapshot()).toEqual(before);
  });

  it('retains historical graph facts while rejecting edits and dispatch', async () => {
    const goal = await new GoalModel(db, userId).create({
      title: 'Historical goal',
      requirement: 'Keep this history',
    });
    const graph = new GoalGraphModel(db, userId);
    await graph.createNode(goal.id, { kind: 'problem', title: 'Recorded problem' });
    const before = await snapshot();
    const service = new GoalService(db, userId);
    for (const write of [
      () => service.tick(goal.id),
      () => service.pause(goal.id),
      () => service.resume(goal.id),
      () => service.delete(goal.id),
      () => service.updateRequirement(goal.id, 'Replacement'),
      () => service.addNode(goal.id, { kind: 'task', title: 'Must not exist' }),
      () => service.setBudget(goal.id, { maxRounds: 10 }),
    ])
      await expect(write()).rejects.toThrow('Standalone Goal execution is unavailable');
    expect(await snapshot()).toEqual(before);
    const archived = await service.graph(goal.id);
    expect(archived.goal.requirement).toBe('Keep this history');
    expect(archived.nodes.map((node) => node.title)).toEqual(['Recorded problem']);
    expect((await new GoalModel(db, userId).list()).goals.map((item) => item.goal.id)).toEqual([
      goal.id,
    ]);
  });
});
