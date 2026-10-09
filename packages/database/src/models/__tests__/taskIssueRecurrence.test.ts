// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { users, workspaceMembers, workspaces } from '../../schemas';
import { TaskModel } from '../task';
import { TaskIssueRecurrenceModel } from '../taskIssueRecurrence';

const db = await getTestDB();
const userId = 'recurrence-model-owner';
const otherId = 'recurrence-model-other';
const workspaceId = 'recurrence-model-workspace';
const model = new TaskIssueRecurrenceModel(db, userId);
const input = {
  cadence: 'week' as const,
  definition: {
    editorData: null,
    instruction: 'Review the release',
    labelIds: [],
    name: 'Weekly review',
    priority: null,
    projectId: null,
    teamId: null,
  },
  firstDueDate: '2026-10-09',
  interval: 1,
  nextOccurrenceAt: new Date('2026-10-09T00:00:00Z'),
  timezone: 'UTC',
};
const clean = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, otherId));
};
beforeEach(async () => {
  await clean();
  await db.insert(users).values([{ id: userId }, { id: otherId }]);
  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Recurrence test',
    primaryOwnerId: userId,
    slug: workspaceId,
  });
  await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
});
afterEach(clean);

describe('TaskIssueRecurrenceModel', () => {
  it('allows viewer reads but rejects every viewer write and revoked membership', async () => {
    await db.insert(workspaceMembers).values({ role: 'viewer', userId: otherId, workspaceId });
    const task = await new TaskModel(db, userId, workspaceId).create({
      instruction: 'Shared review',
    });
    const owner = new TaskIssueRecurrenceModel(db, userId, workspaceId);
    const created = await owner.set(task.id, input);
    const viewer = new TaskIssueRecurrenceModel(db, otherId, workspaceId);
    await expect(viewer.findForTask(task.id)).resolves.toMatchObject({ id: created.id });
    await expect(viewer.set(task.id, { ...input, interval: 9 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(viewer.setEnabled(task.id, false)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(viewer.remove(task.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, otherId));
    await expect(viewer.setEnabled(task.id, false)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await owner.findForTask(task.id)).toMatchObject({ enabled: true, interval: 1 });
  });
  it('creates, updates, disables, re-enables and removes one durable definition per issue', async () => {
    const task = await new TaskModel(db, userId).create({ instruction: 'Review' });
    expect(await model.findForTask(task.id)).toBeNull();
    const created = await model.set(task.id, input);
    expect(created).toMatchObject({ enabled: true, nextDueDate: input.firstDueDate, userId });
    expect((await model.setEnabled(task.id, false)).enabled).toBe(false);
    const updated = await model.set(task.id, { ...input, interval: 2 });
    expect(updated).toMatchObject({ enabled: true, id: created.id, interval: 2 });
    expect(await model.findForTask(task.id)).toMatchObject({ id: created.id, interval: 2 });
    expect(await model.remove(task.id)).toBe(true);
    expect(await model.remove(task.id)).toBe(false);
    expect(await model.findForTask(task.id)).toBeNull();
    await expect(model.setEnabled(task.id, true)).rejects.toThrow('Recurring issue not found');
  });

  it('rejects another user for every operation without changing the definition', async () => {
    const task = await new TaskModel(db, userId).create({ instruction: 'Private review' });
    const created = await model.set(task.id, input);
    const foreign = new TaskIssueRecurrenceModel(db, otherId);
    await expect(foreign.findForTask(task.id)).rejects.toThrow('Task not found');
    await expect(foreign.set(task.id, { ...input, interval: 9 })).rejects.toThrow('Task not found');
    await expect(foreign.setEnabled(task.id, false)).rejects.toThrow('Task not found');
    await expect(foreign.remove(task.id)).rejects.toThrow('Task not found');
    expect(await model.findForTask(task.id)).toMatchObject({
      enabled: true,
      id: created.id,
      interval: 1,
    });
  });

  it('preserves workspace scope and refuses to address a workspace issue from personal scope', async () => {
    const task = await new TaskModel(db, userId, workspaceId).create({
      instruction: 'Workspace review',
    });
    const scoped = new TaskIssueRecurrenceModel(db, userId, workspaceId);
    expect(await scoped.set(task.id, input)).toMatchObject({ workspaceId });
    await expect(model.findForTask(task.id)).rejects.toThrow('Task not found');
    await expect(model.set(task.id, input)).rejects.toThrow('Task not found');
  });
});
