// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { TaskModel } from '../task';
import { TaskSubscriptionModel } from '../taskSubscription';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'sub-user';
const workspaceId = 'sub-ws';

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values({ id: userId });
  await serverDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Sub WS',
    primaryOwnerId: userId,
    slug: 'sub-ws',
  });
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('TaskSubscriptionModel', () => {
  it('resubscribes after an explicit unsubscribe', async () => {
    const task = await new TaskModel(serverDB, userId, workspaceId).create({
      instruction: 'Watch this',
      name: 'Watched',
    });
    const model = new TaskSubscriptionModel(serverDB, userId, workspaceId);
    await model.subscribe(task.id);
    expect(await model.listActiveForTaskIds([task.id, 'missing'])).toEqual([task.id]);

    expect(await model.unsubscribe(task.id)).toBe(true);
    expect(await model.listActiveTaskIds()).toEqual([]);

    await model.subscribe(task.id);
    expect(await model.listActiveTaskIds()).toEqual([task.id]);
  });

  it('does not clear assignee or reviewer when the follow is removed', async () => {
    const tasks = new TaskModel(serverDB, userId, workspaceId);
    const task = await tasks.create({
      assigneeUserId: userId,
      instruction: 'Stay mine',
      name: 'Still assigned',
      reviewerUserId: userId,
    });
    const model = new TaskSubscriptionModel(serverDB, userId, workspaceId);
    await model.subscribe(task.id);
    expect(await model.unsubscribe(task.id)).toBe(true);

    const after = await tasks.findById(task.id);
    expect(after?.assigneeUserId).toBe(userId);
    expect(after?.reviewerUserId).toBe(userId);
    expect(await model.listActiveTaskIds()).toEqual([]);
  });
});
