// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { seedReviewedIssueDelivery } from '../../../tests/fixtures/issueDelivery';
import { getTestDB } from '../../core/getTestDB';
import {
  projects,
  tasks,
  taskTopics,
  users,
  verifyCheckResults,
  verifyEvidence,
  verifyRuns,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import { IssueDeliveryModel } from '../issueDelivery';
import { TaskModel } from '../task';

const db = await getTestDB();
const userId = 'delivery-owner';
const other = 'delivery-other';
const taskModel = new TaskModel(db, userId);
const deliveryModel = new IssueDeliveryModel(db, userId);

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
  await db.insert(users).values([{ id: userId }, { id: other }]);
});
afterEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
});

async function diamond() {
  const a = await taskModel.create({ instruction: 'A' });
  const b = await taskModel.create({ instruction: 'B' });
  const c = await taskModel.create({ instruction: 'C' });
  await taskModel.addDependency(c.id, a.id);
  await taskModel.addDependency(c.id, b.id);
  return { a, b, c };
}

describe('Issue delivery readiness', () => {
  it('admits C only when both exact A/B versions are reviewed, before acceptance, merge or Done', async () => {
    const { a, b, c } = await diamond();
    await seedReviewedIssueDelivery(db, a.id);
    await expect(taskModel.reserveRun(c.id, 'c-run')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await seedReviewedIssueDelivery(db, b.id);
    const current = await deliveryModel.readCurrentDeliveryProof([a.id, b.id]);
    expect(current[a.id]).toMatchObject({
      availableForDependents: true,
      merged: false,
      deliveryAccepted: false,
    });
    expect((await taskModel.getUnlockedTasks(a.id)).map((task) => task.id)).toEqual([c.id]);
    expect((await taskModel.findById(a.id))?.workflowCategory).toBe('in_review');
    await expect(taskModel.reserveRun(c.id, 'c-run')).resolves.toBe(true);
  });

  it('a manual Done label without a reviewed delivery does not satisfy a prerequisite', async () => {
    const { a, b, c } = await diamond();
    await taskModel.updateStatus(a.id, 'completed');
    await taskModel.updateStatus(b.id, 'completed');
    expect(await taskModel.areAllDependenciesCompleted(c.id)).toBe(false);
    await expect(taskModel.reserveRun(c.id, 'manual')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it.each(['failed', 'canceled'] as const)(
    'blocks a current %s upstream rather than using its historical success',
    async (status) => {
      const { a, b, c } = await diamond();
      await seedReviewedIssueDelivery(db, a.id);
      await seedReviewedIssueDelivery(db, b.id);
      if (status === 'canceled') await taskModel.updateStatus(b.id, 'canceled');
      else await db.update(taskTopics).set({ status: 'failed' }).where(eq(taskTopics.taskId, b.id));
      await expect(taskModel.reserveRun(c.id, 'manual')).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
      expect(await taskModel.getUnlockedTasks(a.id)).toEqual([]);
    },
  );

  it('blocks missing evidence, failed checks, mismatched Reviewer and stale source/generation/revision', async () => {
    const a = await taskModel.create({ instruction: 'A' });
    const seeded = await seedReviewedIssueDelivery(db, a.id);
    const available = async () =>
      (await deliveryModel.readCurrentDeliveryProof([a.id]))[a.id].availableForDependents;
    expect(await available()).toBe(true);
    await db
      .update(verifyEvidence)
      .set({ content: ' ' })
      .where(eq(verifyEvidence.checkResultId, seeded.result.id));
    expect(await available()).toBe(false);
    await db
      .update(verifyEvidence)
      .set({ content: 'observed' })
      .where(eq(verifyEvidence.checkResultId, seeded.result.id));
    await db
      .update(verifyCheckResults)
      .set({ status: 'failed', verdict: 'failed' })
      .where(eq(verifyCheckResults.id, seeded.result.id));
    expect(await available()).toBe(false);
    await db
      .update(verifyCheckResults)
      .set({ status: 'passed', verdict: 'passed' })
      .where(eq(verifyCheckResults.id, seeded.result.id));
    await db
      .update(verifyRuns)
      .set({
        metadata: {
          ...seeded.run.metadata,
          issueReviewer: { cycleId: 'different', operationId: 'different', verdict: 'pass' },
        },
      })
      .where(eq(verifyRuns.id, seeded.run.id));
    expect(await available()).toBe(false);
    await db
      .update(verifyRuns)
      .set({ metadata: seeded.run.metadata })
      .where(eq(verifyRuns.id, seeded.run.id));
    await db
      .update(taskTopics)
      .set({ integration: { ...seeded.topic.integration!, expectedHeadSha: 'b'.repeat(40) } })
      .where(eq(taskTopics.id, seeded.topic.id));
    expect(await available()).toBe(false);
    await db
      .update(taskTopics)
      .set({ integration: seeded.topic.integration })
      .where(eq(taskTopics.id, seeded.topic.id));
    await db
      .update(tasks)
      .set({ executionGeneration: a.executionGeneration + 1 })
      .where(eq(tasks.id, a.id));
    expect(await available()).toBe(false);
    await db
      .update(tasks)
      .set({ executionGeneration: a.executionGeneration })
      .where(eq(tasks.id, a.id));
    await db
      .update(verifyRuns)
      .set({
        metadata: {
          ...seeded.run.metadata,
          issueDelivery: { ...seeded.proof, checklistRevision: 2 },
        },
      })
      .where(eq(verifyRuns.id, seeded.run.id));
    expect(await available()).toBe(false);
  });

  it('rejects cycles through the existing Issue blocks relation', async () => {
    const { a, c } = await diamond();
    await expect(taskModel.addDependency(a.id, c.id)).rejects.toMatchObject({ reason: 'CYCLE' });
  });

  it('caps delivery reads and manual reservation at user and private Project visibility', async () => {
    const a = await taskModel.create({ instruction: 'Private A' });
    await seedReviewedIssueDelivery(db, a.id);
    expect(await new IssueDeliveryModel(db, other).readCurrentDeliveryProof([a.id])).toEqual({});
    const ws = 'delivery-workspace';
    await db.insert(workspaces).values({ id: ws, name: ws, slug: ws, primaryOwnerId: userId });
    await db.insert(workspaceMembers).values([
      { workspaceId: ws, userId, role: 'owner' },
      { workspaceId: ws, userId: other, role: 'member' },
    ]);
    await db.insert(projects).values({
      id: 'delivery-private-project',
      identifier: 'PRIV',
      name: 'Private',
      userId,
      workspaceId: ws,
      visibility: 'private',
    });
    const owner = new TaskModel(db, userId, ws);
    const upstream = await owner.create({
      instruction: 'Workspace A',
      projectId: 'delivery-private-project',
    });
    const dependent = await owner.create({
      instruction: 'Workspace C',
      projectId: 'delivery-private-project',
    });
    await owner.addDependency(dependent.id, upstream.id);
    await seedReviewedIssueDelivery(db, upstream.id);
    expect(
      await new IssueDeliveryModel(db, other, ws).readCurrentDeliveryProof([upstream.id]),
    ).toEqual({});
    await expect(
      new TaskModel(db, other, ws).reserveRun(dependent.id, 'other'),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(owner.reserveRun(dependent.id, 'owner')).resolves.toBe(true);
  });
});
