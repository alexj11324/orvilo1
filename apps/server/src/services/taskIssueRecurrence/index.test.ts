// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { TaskModel } from '@/database/models/task';
import { TaskIssueRecurrenceModel } from '@/database/models/taskIssueRecurrence';
import {
  agentOperations,
  taskDispatches,
  taskIssueRecurrences,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';

import { TaskIssueRecurrenceService } from './index';
import { runTaskIssueRecurrenceSweep } from './sweep';

const db = await getTestDB();
const userId = 'issue-recurrence-owner';
const readerId = 'issue-recurrence-reader';
const workspaceId = 'issue-recurrence-workspace';
const model = new TaskModel(db, userId, workspaceId);
const recurrence = new TaskIssueRecurrenceModel(db, userId, workspaceId);
const service = new TaskIssueRecurrenceService(db, userId, workspaceId);
const clean = async () => {
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, readerId));
};
beforeEach(async () => {
  await clean();
  await db.insert(users).values([{ id: userId }, { id: readerId }]);
  await db
    .insert(workspaces)
    .values({ id: workspaceId, slug: workspaceId, name: 'Recurrence', primaryOwnerId: userId });
  await db.insert(workspaceMembers).values([
    { userId, workspaceId, role: 'owner' },
    { userId: readerId, workspaceId, role: 'member' },
  ]);
});
afterEach(clean);
const convert = async (visibility: 'public' | 'private' = 'public') => {
  const task = await model.create({
    name: 'Weekly issue',
    instruction: 'Checklist',
    workflowCategory: 'todo',
    visibility,
  });
  const row = await service.convert({
    id: task.id,
    expectedDomainRevision: task.domainRevision,
    firstDueDate: '2026-10-05',
    cadence: 'week',
    timezone: 'UTC',
  });
  return { task, row };
};
describe('TaskIssueRecurrenceService', () => {
  it('creates one inactive next issue at the due boundary and does not repeat the same sweep', async () => {
    const { task } = await convert();
    expect((await model.findById(task.id))?.dueDate).toBe('2026-10-05');
    expect(
      await runTaskIssueRecurrenceSweep({ db, now: new Date('2026-10-06T00:00:59Z') }),
    ).toMatchObject({ created: 0 });
    expect(
      await runTaskIssueRecurrenceSweep({ db, now: new Date('2026-10-06T00:01:00Z') }),
    ).toMatchObject({ claimed: 1, created: 1, failed: 0 });
    const saved = (await recurrence.findForTask(task.id))!;
    const created = (await model.findById(saved.lastTaskId!))!;
    expect(created).toMatchObject({
      name: 'Weekly issue',
      instruction: 'Checklist',
      dueDate: '2026-10-12',
      workflowCategory: 'todo',
      automationMode: null,
      totalTopics: 0,
      currentTopicId: null,
      runReservationId: null,
    });
    expect(
      await db.select().from(agentOperations).where(eq(agentOperations.taskId, created.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(taskDispatches).where(eq(taskDispatches.taskId, created.id)),
    ).toHaveLength(0);
    expect(
      await runTaskIssueRecurrenceSweep({ db, now: new Date('2026-10-06T00:01:00Z') }),
    ).toMatchObject({ claimed: 0, created: 0 });
  });
  it('persists pause/resume and removes the recurrence without deleting its issue', async () => {
    const { task } = await convert();
    await recurrence.setEnabled(task.id, false);
    expect(
      await runTaskIssueRecurrenceSweep({ db, now: new Date('2026-10-06T00:01:00Z') }),
    ).toMatchObject({ claimed: 0 });
    await recurrence.setEnabled(task.id, true);
    expect(
      await runTaskIssueRecurrenceSweep({ db, now: new Date('2026-10-06T00:01:00Z') }),
    ).toMatchObject({ created: 1 });
    expect(await recurrence.remove(task.id)).toBe(true);
    expect(await recurrence.findForTask(task.id)).toBeNull();
    expect(await model.findById(task.id)).not.toBeNull();
  });
  it('rechecks current creation permission and pauses visibly after membership is suspended', async () => {
    const { task } = await convert();
    await db
      .update(workspaceMembers)
      .set({ suspendedAt: new Date() })
      .where(eq(workspaceMembers.userId, userId));
    expect(
      await runTaskIssueRecurrenceSweep({ db, now: new Date('2026-10-06T00:01:00Z') }),
    ).toMatchObject({ skipped: 1, created: 0 });
    await expect(recurrence.findForTask(task.id)).rejects.toThrow('Task not found');
    const [persisted] = await db
      .select()
      .from(taskIssueRecurrences)
      .where(eq(taskIssueRecurrences.sourceTaskId, task.id));
    expect(persisted).toMatchObject({
      enabled: false,
      lastError: 'Source issue or creation permission is unavailable',
    });
    expect(await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId))).toHaveLength(1);
  });
  it('shares live workspace Issue series with members and rejects stale conversions and invalid timezones', async () => {
    const { task } = await convert('private');
    await expect(
      new TaskIssueRecurrenceModel(db, readerId, workspaceId).findForTask(task.id),
    ).resolves.toMatchObject({ sourceTaskId: task.id, enabled: true });
    await expect(
      service.convert({
        id: task.id,
        expectedDomainRevision: task.domainRevision,
        firstDueDate: '2026-10-10',
        cadence: 'day',
        timezone: 'UTC',
      }),
    ).rejects.toThrow('TASK_REVISION_CONFLICT');
    await expect(
      service.convert({
        id: task.id,
        expectedDomainRevision: task.domainRevision,
        firstDueDate: '2026-10-10',
        cadence: 'day',
        timezone: 'Invalid/Zone',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
