// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskSubscriptions, users, workspaceMembers, workspaces } from '../../schemas';
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
  await serverDB.insert(workspaceMembers).values({ workspaceId, userId, role: 'owner' });
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

  it('subscribes involved people once and keeps the first reason', async () => {
    await serverDB.insert(users).values({ id: 'sub-other' });
    const task = await new TaskModel(serverDB, userId, workspaceId).create({
      instruction: 'Involve people',
      name: 'Involved',
    });
    const actor = new TaskSubscriptionModel(serverDB, userId, workspaceId);

    await actor.ensureSubscribed(task.id, ['sub-other', 'sub-other', null], 'mentioned');
    await actor.ensureSubscribed(task.id, ['sub-other'], 'assigned');

    const rows = await serverDB
      .select()
      .from(taskSubscriptions)
      .where(eq(taskSubscriptions.taskId, task.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'mentioned', userId: 'sub-other', workspaceId });
    expect(
      await new TaskSubscriptionModel(serverDB, 'sub-other', workspaceId).isSubscribed(task.id),
    ).toBe(true);
    // The actor was not in the list, so the rule did not subscribe them.
    expect(await actor.isSubscribed(task.id)).toBe(false);
  });

  it('never re-subscribes someone who explicitly unsubscribed', async () => {
    const task = await new TaskModel(serverDB, userId, workspaceId).create({
      instruction: 'Leave me out',
      name: 'Muted',
    });
    const model = new TaskSubscriptionModel(serverDB, userId, workspaceId);
    await model.subscribe(task.id);
    expect(await model.unsubscribe(task.id)).toBe(true);

    await model.ensureSubscribed(task.id, [userId], 'commented');

    expect(await model.isSubscribed(task.id)).toBe(false);
    // Only the person themselves can come back, through the manual path.
    await model.subscribe(task.id);
    expect(await model.isSubscribed(task.id)).toBe(true);
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
