// @vitest-environment node
import type { TaskExecutionContract } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  seedConfirmedIssuePlan,
  seedReviewedIssueDelivery,
} from '../../../tests/fixtures/issueDelivery';
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
  await seedConfirmedIssuePlan(db, c.id);
  await taskModel.addDependency(c.id, a.id);
  await taskModel.addDependency(c.id, b.id);
  return { a, b, c };
}

describe('Issue delivery readiness', () => {
  it('rejects completed transitive deliveries built on superseded inputs while preserving accepted history', async () => {
    const d = await taskModel.create({ instruction: 'D' });
    const a = await taskModel.create({ instruction: 'A' });
    const b = await taskModel.create({ instruction: 'B' });
    const unrelated = await taskModel.create({ instruction: 'Unrelated' });
    await taskModel.addDependency(a.id, d.id);
    await taskModel.addDependency(b.id, a.id);
    const reviewed = async (
      taskId: string,
      inputs: Awaited<ReturnType<typeof seedReviewedIssueDelivery>>[],
      seq = 1,
    ) => {
      const delivery = await seedReviewedIssueDelivery(db, taskId, { seq });
      await db
        .update(taskTopics)
        .set({
          contract: {
            content: {
              instruction: 'Consume actual prerequisites',
              dependencies: inputs.map((input) => ({
                type: 'blocks',
                dependsOnId: input.proof.taskId,
                issueDelivery: input.proof,
                checklistRunId: input.run.id,
              })),
            },
          } as TaskExecutionContract,
        })
        .where(eq(taskTopics.id, delivery.topic.id));
      await db
        .update(verifyRuns)
        .set({ userDecision: 'accept' })
        .where(eq(verifyRuns.id, delivery.run.id));
      await db
        .update(verifyCheckResults)
        .set({ userDecision: 'accepted' })
        .where(eq(verifyCheckResults.id, delivery.result.id));
      return delivery;
    };
    const oldD = await reviewed(d.id, []);
    const oldA = await reviewed(a.id, [oldD]);
    const oldB = await reviewed(b.id, [oldA]);
    await reviewed(unrelated.id, []);
    const read = () => deliveryModel.readCurrentDeliveryProof([a.id, b.id, unrelated.id]);
    expect((await read())[b.id]).toMatchObject({
      availableForDependents: true,
      deliveryAccepted: true,
      itemsAccepted: true,
    });
    // D redelivery also invalidates B, whose direct A proof has not changed.
    const newD = await reviewed(d.id, [], 2);
    expect((await read())[a.id].availableForDependents).toBe(false);
    expect((await read())[b.id].deliveryAccepted).toBe(false);
    const newA = await reviewed(a.id, [newD], 2);
    expect((await read())[a.id].availableForDependents).toBe(true);
    expect((await read())[b.id].availableForDependents).toBe(false);
    await reviewed(b.id, [newA], 2);
    expect((await read())[b.id].availableForDependents).toBe(true);
    // Refinement removes D -> A; B must consume redelivered A again.
    await taskModel.removeDependency(a.id, d.id);
    expect((await read())[a.id].availableForDependents).toBe(false);
    await reviewed(a.id, [], 3);
    expect((await read())[b.id].deliveryAccepted).toBe(false);
    expect((await read())[unrelated.id]).toMatchObject({
      availableForDependents: true,
      deliveryAccepted: true,
    });
    const [historical] = await db.select().from(verifyRuns).where(eq(verifyRuns.id, oldB.run.id));
    const [acceptedItem] = await db
      .select()
      .from(verifyCheckResults)
      .where(eq(verifyCheckResults.id, oldB.result.id));
    expect(historical.userDecision).toBe('accept');
    expect(acceptedItem.userDecision).toBe('accepted');
    expect((await taskModel.findById(b.id))?.executionGeneration).toBe(b.executionGeneration);
  });

  it('rejects accepted B after D -> A is removed and A redelivers in its refined generation', async () => {
    const d = await taskModel.create({ instruction: 'D' });
    const a = await taskModel.create({ instruction: 'A' });
    const b = await taskModel.create({ instruction: 'B' });
    await taskModel.addDependency(a.id, d.id);
    await taskModel.addDependency(b.id, a.id);
    const oldD = await seedReviewedIssueDelivery(db, d.id);
    const oldA = await seedReviewedIssueDelivery(db, a.id);
    const oldB = await seedReviewedIssueDelivery(db, b.id);
    for (const [delivery, input] of [
      [oldA, oldD],
      [oldB, oldA],
    ]) {
      await db
        .update(taskTopics)
        .set({
          contract: {
            content: {
              instruction: 'Use prerequisite',
              dependencies: [
                {
                  type: 'blocks',
                  dependsOnId: input.proof.taskId,
                  issueDelivery: input.proof,
                  checklistRunId: input.run.id,
                },
              ],
            },
          } as TaskExecutionContract,
        })
        .where(eq(taskTopics.id, delivery.topic.id));
    }
    await db
      .update(verifyRuns)
      .set({ userDecision: 'accept' })
      .where(eq(verifyRuns.id, oldB.run.id));
    await db
      .update(verifyCheckResults)
      .set({ userDecision: 'accepted' })
      .where(eq(verifyCheckResults.id, oldB.result.id));
    await seedConfirmedIssuePlan(db, b.id);
    expect((await deliveryModel.readCurrentDeliveryProof([b.id]))[b.id].deliveryAccepted).toBe(
      true,
    );
    await taskModel.removeDependency(a.id, d.id);
    await db
      .update(tasks)
      .set({ executionGeneration: a.executionGeneration + 1 })
      .where(eq(tasks.id, a.id));
    const newA = await seedReviewedIssueDelivery(db, a.id, { seq: 2 });
    await db
      .update(verifyRuns)
      .set({ userDecision: 'accept' })
      .where(eq(verifyRuns.id, newA.run.id));
    for (const delivery of [newA, oldB])
      await db
        .update(taskTopics)
        .set({
          integration: {
            ...delivery.topic.integration!,
            state: 'integrated',
            mergedTargetBranch: 'canary',
            integratedSha: 'e'.repeat(40),
          },
        })
        .where(eq(taskTopics.id, delivery.topic.id));
    const current = await deliveryModel.readCurrentDeliveryProof([a.id, b.id]);
    expect(current[a.id].availableForDependents).toBe(true);
    expect(current[b.id]).toMatchObject({
      deliveryAccepted: false,
      itemsAccepted: false,
      availableForDependents: false,
    });
    expect(
      (await db.select().from(verifyRuns).where(eq(verifyRuns.id, oldB.run.id)))[0].userDecision,
    ).toBe('accept');
    await expect(taskModel.updateStatus(b.id, 'completed')).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('does not authorize a completed consumer when its new required input was never recorded', async () => {
    const upstream = await taskModel.create({ instruction: 'Upstream' });
    const consumer = await taskModel.create({ instruction: 'Consumer' });
    await seedReviewedIssueDelivery(db, upstream.id);
    await seedReviewedIssueDelivery(db, consumer.id);
    await taskModel.addDependency(consumer.id, upstream.id);
    expect(
      (await deliveryModel.readCurrentDeliveryProof([consumer.id]))[consumer.id]
        .availableForDependents,
    ).toBe(false);
  });

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
    await seedConfirmedIssuePlan(db, dependent.id);
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
