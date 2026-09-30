// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { taskReminders, tasks, users, workspaces } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import {
  claimDueTaskReminders,
  markTaskReminderDelivered,
  recordTaskReminderAttempt,
  TaskReminderModel,
} from '../taskReminder';

const db: OrviloDatabase = await getTestDB();
const userId = 'task-reminder-user';
const otherUserId = 'task-reminder-other-user';
const workspaceId = 'task-reminder-workspace';

const cleanup = async () => {
  await db.delete(taskReminders);
  await db.delete(tasks).where(eq(tasks.workspaceId, workspaceId));
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherUserId));
};

const createTask = async (identifier: string, seq: number) => {
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: userId,
      identifier,
      instruction: `Run ${identifier}`,
      seq,
      workspaceId,
    })
    .returning();
  return task;
};

beforeEach(async () => {
  await cleanup();
  await db.insert(users).values([{ id: userId }, { id: otherUserId }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Task Reminder Workspace',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
});

afterEach(cleanup);

describe('TaskReminderModel', () => {
  it('returns an armed reminder and null after delivery', async () => {
    const task = await createTask('REM-1', 1);
    const model = new TaskReminderModel(db, userId, workspaceId);
    const future = new Date(Date.now() + 3_600_000);

    const set = await model.setReminder(task.id, future);
    expect(set.remindAt).toEqual(future);
    expect(await model.getReminder(task.id)).toMatchObject({ id: set.id });

    await markTaskReminderDelivered(db, set.id);
    expect(await model.getReminder(task.id)).toBeNull();
  });

  it('isolates reminders per user', async () => {
    const task = await createTask('REM-2', 2);
    const model = new TaskReminderModel(db, userId, workspaceId);
    const otherModel = new TaskReminderModel(db, otherUserId, workspaceId);

    await model.setReminder(task.id, new Date(Date.now() + 3_600_000));

    expect(await otherModel.getReminder(task.id)).toBeNull();
    expect(await otherModel.clearReminder(task.id)).toBe(false);
    expect(await model.getReminder(task.id)).not.toBeNull();
  });

  it('resets delivery state when the reminder is re-armed', async () => {
    const task = await createTask('REM-3', 3);
    const model = new TaskReminderModel(db, userId, workspaceId);
    const set = await model.setReminder(task.id, new Date(Date.now() + 3_600_000));

    await recordTaskReminderAttempt(db, set.id, 3, new Date(Date.now() + 60_000));
    await markTaskReminderDelivered(db, set.id);

    const reset = await model.setReminder(task.id, new Date(Date.now() + 7_200_000));
    expect(reset).toMatchObject({ attemptCount: 0, deliveredAt: null, nextAttemptAt: null });
  });
});

describe('claimDueTaskReminders', () => {
  it('skips rows parked on backoff and re-claims them after nextAttemptAt', async () => {
    const now = new Date();
    const task = await createTask('REM-4', 4);
    const model = new TaskReminderModel(db, userId, workspaceId);
    const set = await model.setReminder(task.id, new Date(now.getTime() - 1_000));

    // A parked row is invisible to claims until nextAttemptAt elapses.
    await recordTaskReminderAttempt(db, set.id, 1, new Date(now.getTime() + 3_600_000));
    expect(await claimDueTaskReminders(db, { now })).toHaveLength(0);

    const claimed = await claimDueTaskReminders(db, {
      now: new Date(now.getTime() + 7_200_000),
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ attemptCount: 1, id: set.id });
  });

  it('does not claim delivered rows', async () => {
    const task = await createTask('REM-5', 5);
    const model = new TaskReminderModel(db, userId, workspaceId);
    const set = await model.setReminder(task.id, new Date(Date.now() - 1_000));

    await markTaskReminderDelivered(db, set.id);
    expect(await claimDueTaskReminders(db, { now: new Date() })).toHaveLength(0);
  });
});
