// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedReviewedIssueDelivery } from '../../../tests/fixtures/issueDelivery';
import { TaskModel } from '../../models/task';
import {
  acceptances,
  tasks,
  taskTopics,
  users,
  verifyCheckResults,
  verifyRuns,
} from '../../schemas';
import { getTestDB } from '../getTestDB';

const db = await getTestDB();
const userId = 'artifact-migration-owner';
const oldGate = await readFile(
  resolve(__dirname, '../../../migrations/0202_pr_delivery_gate_workflow_category.sql'),
  'utf8',
);
const migration = await readFile(
  resolve(__dirname, '../../../migrations/0213_issue784_issue_delivery.sql'),
  'utf8',
);
const apply = async (source: string) => {
  for (const statement of source.split('--> statement-breakpoint'))
    if (statement.trim()) await db.execute(sql.raw(statement));
};
const complete = (id: string) =>
  db.update(tasks).set({ workflowCategory: 'done' }).where(eq(tasks.id, id));

beforeEach(async () => {
  await db.insert(users).values({ id: userId });
});
afterEach(async () => {
  await db.delete(tasks).where(eq(tasks.createdByUserId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await apply(migration);
});

async function artifact() {
  const task = await new TaskModel(db, userId).create({ instruction: 'Publish combined report' });
  const seeded = await seedReviewedIssueDelivery(db, task.id);
  const [current] = await db.select().from(tasks).where(eq(tasks.id, task.id));
  const [aggregate] = await db.select().from(acceptances).where(eq(acceptances.subjectId, task.id));
  await db
    .update(tasks)
    .set({
      legacyReviewerUserId: userId,
      config: {
        ...(current.config as object),
        workspace: { provider: 'git', repo: 'org/repo', baseBranch: 'canary' },
      },
    })
    .where(eq(tasks.id, task.id));
  await db.update(taskTopics).set({ integration: null }).where(eq(taskTopics.id, seeded.topic.id));
  await db
    .update(acceptances)
    .set({
      metadata: {
        issueChecklist: { ...aggregate.metadata!.issueChecklist!, deliveryKind: 'artifact' },
      },
    })
    .where(eq(acceptances.id, aggregate.id));
  await db
    .update(verifyRuns)
    .set({
      userDecision: 'accept',
      metadata: {
        ...seeded.run.metadata,
        issueDelivery: { ...seeded.proof, deliveryKind: 'artifact' },
      },
    })
    .where(eq(verifyRuns.id, seeded.run.id));
  await db
    .update(verifyCheckResults)
    .set({ userDecision: 'accepted' })
    .where(eq(verifyCheckResults.id, seeded.result.id));
  return { task, seeded };
}

describe('Issue delivery migration', () => {
  it('admits an accepted current report without a PR and retains the historical reviewer on reapply', async () => {
    const { task } = await artifact();
    await apply(oldGate);
    await expect(complete(task.id)).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'tasks_completed_requires_merged_pr' },
    });
    await apply(migration);
    await apply(migration);
    await complete(task.id);
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(row.workflowCategory).toBe('done');
    expect(row.legacyReviewerUserId).toBe(userId);
  });

  it('rejects an unaccepted or stale artifact instead of bypassing the repository gate', async () => {
    const { task, seeded } = await artifact();
    await db.update(verifyRuns).set({ userDecision: null }).where(eq(verifyRuns.id, seeded.run.id));
    await expect(complete(task.id)).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'tasks_completed_requires_merged_pr' },
    });
    await db
      .update(verifyRuns)
      .set({ userDecision: 'accept' })
      .where(eq(verifyRuns.id, seeded.run.id));
    await db
      .update(tasks)
      .set({ executionGeneration: task.executionGeneration + 1 })
      .where(eq(tasks.id, task.id));
    await expect(complete(task.id)).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'tasks_completed_requires_merged_pr' },
    });
  });

  it('preserves the merged PR gate for code deliveries', async () => {
    const task = await new TaskModel(db, userId).create({ instruction: 'Code delivery' });
    await seedReviewedIssueDelivery(db, task.id);
    await expect(complete(task.id)).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'tasks_completed_requires_merged_pr' },
    });
  });
});
