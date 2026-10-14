// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { acceptances, tasks, users } from '../../schemas';
import { TaskModel } from '../task';

const db = await getTestDB();
const userId = 'plan-admission-owner';
const model = new TaskModel(db, userId);
const items = [{ id: 'outcome', title: 'Approved outcome', required: true }];

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
  await db.insert(users).values({ id: userId });
});
afterEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
});

async function confirmed(id: string, withChecklist = true) {
  const confirmedAt = new Date().toISOString();
  await db
    .update(tasks)
    .set({
      config: { workspace: { repo: 'org/approved', baseBranch: 'canary' } },
      context: {
        issuePlan: {
          revision: 1,
          parentTaskId: id,
          confirmedAt,
          confirmedBy: userId,
          checklists: [
            {
              taskId: id,
              expectedRevision: 0,
              items,
              deliveryKind: 'code',
              repo: 'org/approved',
              targetBranch: 'canary',
            },
          ],
        },
      },
    })
    .where(eq(tasks.id, id));
  if (withChecklist)
    await db.insert(acceptances).values({
      subjectType: 'task',
      subjectId: id,
      userId,
      metadata: {
        issueChecklist: {
          revision: 1,
          items,
          deliveryKind: 'code',
          repo: 'org/approved',
          targetBranch: 'canary',
          confirmedAt,
          confirmedBy: userId,
        },
      },
    });
}

describe('confirmed Issue plan admission', () => {
  it('refuses a manual reservation before plan confirmation', async () => {
    const task = await model.create({ instruction: 'Implement a change' });
    await expect(model.reserveRun(task.id, 'manual')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect((await model.findById(task.id))?.runReservationId).toBeNull();
  });

  it('requires the actual confirmed Checklist, rather than a context marker', async () => {
    const task = await model.create({ instruction: 'Implement a change' });
    await confirmed(task.id, false);
    await expect(model.reserveRun(task.id, 'forged')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('admits the confirmed scope and refuses a different repository or Checklist revision', async () => {
    const task = await model.create({ instruction: 'Implement a change' });
    await confirmed(task.id);
    await expect(model.reserveRun(task.id, 'approved')).resolves.toBe(true);
    await model.releaseRunReservation(task.id, 'approved');
    await db
      .update(tasks)
      .set({ config: { workspace: { repo: 'org/other', baseBranch: 'canary' } } })
      .where(eq(tasks.id, task.id));
    await expect(model.reserveRun(task.id, 'wrong-repo')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await db
      .update(tasks)
      .set({ config: { workspace: { repo: 'org/approved', baseBranch: 'canary' } } })
      .where(eq(tasks.id, task.id));
    await db
      .update(acceptances)
      .set({
        metadata: {
          issueChecklist: {
            revision: 2,
            items,
            deliveryKind: 'code',
            repo: 'org/approved',
            targetBranch: 'canary',
            confirmedAt: new Date().toISOString(),
            confirmedBy: userId,
          },
        },
      })
      .where(eq(acceptances.subjectId, task.id));
    await expect(model.reserveRun(task.id, 'stale-checklist')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});
