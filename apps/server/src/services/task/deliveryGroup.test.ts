// @vitest-environment node
import type { IssuePlan, TaskContext } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { TaskModel } from '@/database/models/task';
import { tasks, users } from '@/database/schemas';
import { acceptances, verifyCheckResults, verifyRuns } from '@/database/schemas/verify';

import { seedReviewedIssueDelivery } from '../../../../../packages/database/tests/fixtures/issueDelivery';
import { IssueChecklistService } from './checklist';
import {
  completeAcceptedArtifacts,
  confirmedDeliveryMemberIds,
  readDeliveryGroup,
} from './deliveryGroup';

const db = await getTestDB();
const userId = 'delivery-group-owner';
const model = () => new TaskModel(db, userId);

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
  await db.insert(users).values({ id: userId });
});
afterEach(async () => {
  await db.delete(tasks);
  await db.delete(users);
});

async function group() {
  const parent = await model().create({ instruction: 'Combined artifact report' });
  const a = await model().create({ instruction: 'Repo A', parentTaskId: parent.id });
  const b = await model().create({ instruction: 'Repo B', parentTaskId: parent.id });
  const manual = await model().create({
    instruction: 'Unrelated old child',
    parentTaskId: parent.id,
  });
  await model().addDependency(parent.id, a.id);
  await model().addDependency(parent.id, b.id);
  const plan: IssuePlan = {
    parentTaskId: parent.id,
    revision: 1,
    confirmedAt: '2026-10-14T00:00:00Z',
    confirmedBy: userId,
    plannedBy: userId,
    orchestratorAgentId: 'orchestrator',
    planningOperationId: 'plan',
    requirement: 'Deliver two repos',
    summary: 'Two repos',
    scopeFingerprint: 'scope',
    scope: {
      description: 'Two repos',
      repositories: [
        { repo: 'org/repo', targetBranch: 'canary' },
        { repo: 'other/repo', targetBranch: 'main' },
      ],
    },
    checklists: [parent, a, b].map((task) => ({
      taskId: task.id,
      expectedRevision: 0,
      deliveryKind: task.id === parent.id ? 'artifact' : 'code',
      repo: task.id === b.id ? 'other/repo' : 'org/repo',
      targetBranch: task.id === b.id ? 'main' : 'canary',
      items: [{ id: 'outcome', title: 'Outcome', required: true }],
    })),
  };
  const deliveries = [];
  for (const task of [parent, a, b]) {
    await db
      .update(tasks)
      .set({ context: { issuePlan: plan } })
      .where(eq(tasks.id, task.id));
    const delivery = await seedReviewedIssueDelivery(db, task.id);
    const proof = {
      ...delivery.proof,
      ...(task.id === parent.id
        ? {
            deliveryKind: 'artifact' as const,
            sourceSha: undefined,
            repo: undefined,
            branch: undefined,
            baseBranch: undefined,
          }
        : {}),
      ...(task.id === b.id ? { repo: 'other/repo', targetBranch: 'main' } : {}),
    };
    await db
      .update(verifyRuns)
      .set({ metadata: { ...delivery.run.metadata, issueDelivery: proof } })
      .where(eq(verifyRuns.id, delivery.run.id));
    const [aggregate] = await db
      .select()
      .from(acceptances)
      .where(eq(acceptances.subjectId, task.id));
    await db
      .update(acceptances)
      .set({
        metadata: {
          ...aggregate.metadata,
          issueChecklist: {
            ...aggregate.metadata!.issueChecklist!,
            deliveryKind: proof.deliveryKind,
            repo: proof.repo,
            targetBranch: proof.targetBranch,
          },
        },
      })
      .where(eq(acceptances.id, aggregate.id));
    if (task.id === parent.id) {
      const { taskTopics } = await import('@/database/schemas/task');
      await db
        .update(taskTopics)
        .set({ integration: null })
        .where(eq(taskTopics.id, delivery.topic.id));
    }
    if (task.id === b.id) {
      const { taskTopics } = await import('@/database/schemas/task');
      await db
        .update(taskTopics)
        .set({ integration: { ...delivery.topic.integration!, repo: proof.repo } })
        .where(eq(taskTopics.id, delivery.topic.id));
    }
    await db
      .update(verifyCheckResults)
      .set({ userDecision: 'accepted' })
      .where(eq(verifyCheckResults.id, delivery.result.id));
    deliveries.push({ ...delivery, proof });
  }
  return { parent: (await model().findById(parent.id))!, a, b, manual, deliveries, plan };
}

describe('confirmed delivery group', () => {
  it('accepts current mixed-repository proofs together, excluding manual and old descendants', async () => {
    const f = await group();
    expect(confirmedDeliveryMemberIds(f.parent)).toEqual([f.parent.id, f.a.id, f.b.id].sort());
    const service = new IssueChecklistService(db, userId);
    const parent = f.deliveries[0];
    await service.acceptDelivery({
      taskId: f.parent.id,
      runId: parent.run.id,
      proof: parent.proof,
    });
    const current = await readDeliveryGroup(db, userId, undefined, f.parent);
    expect(current.accepted).toBe(true);
    expect(current.ids).not.toContain(f.manual.id);
    expect(current.proofs[f.b.id].proof?.repo).toBe('other/repo');
    expect((await model().findById(f.parent.id))?.workflowCategory).toBe('in_review');
  });

  it('cannot accept a child separately and atomically rejects a stale child head', async () => {
    const f = await group();
    const service = new IssueChecklistService(db, userId);
    const child = f.deliveries[1];
    await expect(
      service.acceptDelivery({ taskId: f.a.id, runId: child.run.id, proof: child.proof }),
    ).rejects.toThrow('parent Issue');
    const { taskTopics } = await import('@/database/schemas/task');
    await db
      .update(taskTopics)
      .set({ integration: { ...child.topic.integration!, expectedHeadSha: 'b'.repeat(40) } })
      .where(eq(taskTopics.id, child.topic.id));
    const parent = f.deliveries[0];
    await expect(
      service.acceptDelivery({ taskId: f.parent.id, runId: parent.run.id, proof: parent.proof }),
    ).rejects.toThrow('Every current plan delivery');
    const runs = await db.select().from(verifyRuns);
    expect(runs.every((run) => run.userDecision !== 'accept')).toBe(true);
  });

  it('rejects a member moved to a different plan revision', async () => {
    const f = await group();
    await db
      .update(tasks)
      .set({ context: { issuePlan: { ...f.plan, revision: 2 } } as TaskContext })
      .where(eq(tasks.id, f.b.id));
    const current = await readDeliveryGroup(db, userId, undefined, f.parent);
    expect(current.valid).toBe(false);
    expect(current.accepted).toBe(false);
  });
});

it('a rejected merge retains accepted proof while only its dependents remain blocked', async () => {
  const f = await group();
  const service = new IssueChecklistService(db, userId);
  const parent = f.deliveries[0];
  await service.acceptDelivery({ taskId: f.parent.id, runId: parent.run.id, proof: parent.proof });
  const { taskTopics } = await import('@/database/schemas/task');
  const child = f.deliveries[1];
  await db
    .update(taskTopics)
    .set({
      integration: {
        ...child.topic.integration!,
        state: 'blocked',
        lastError: 'GitHub merge rejected',
      },
    })
    .where(eq(taskTopics.id, child.topic.id));
  const groupState = await readDeliveryGroup(db, userId, undefined, f.parent);
  expect(groupState.accepted).toBe(true);
  expect(groupState.proofs[f.a.id].availableForDependents).toBe(false);
  expect(groupState.delivered(f.a.id)).toBe(false);
  expect(groupState.delivered(f.parent.id)).toBe(false);
  expect(groupState.dependencies.filter((edge) => edge.taskId === f.b.id)).toEqual([]);
  expect((await model().findById(f.parent.id))?.workflowCategory).toBe('in_review');
});

it('reads an already delivered external predecessor without adding it to the accepted plan group', async () => {
  const f = await group();
  const external = await model().create({ instruction: 'Previously confirmed prerequisite' });
  const delivery = await seedReviewedIssueDelivery(db, external.id);
  await db
    .update(verifyRuns)
    .set({ userDecision: 'accept' })
    .where(eq(verifyRuns.id, delivery.run.id));
  const { taskTopics } = await import('@/database/schemas/task');
  await db
    .update(taskTopics)
    .set({
      integration: {
        ...delivery.topic.integration!,
        state: 'integrated',
        prNumber: 9,
        prUrl: 'https://github.com/org/repo/pull/9',
        pushedToRemote: true,
        mergedTargetBranch: 'canary',
        integratedSha: 'c'.repeat(40),
      },
    })
    .where(eq(taskTopics.id, delivery.topic.id));
  await model().addDependency(f.a.id, external.id);
  const current = await readDeliveryGroup(db, userId, undefined, f.parent);
  expect(current.ids).not.toContain(external.id);
  expect(current.delivered(external.id)).toBe(true);
});

it('completes the genuine parent artifact only after all confirmed code deliveries really merge', async () => {
  const f = await group();
  const parent = f.deliveries[0];
  await new IssueChecklistService(db, userId).acceptDelivery({
    taskId: f.parent.id,
    runId: parent.run.id,
    proof: parent.proof,
  });
  const completed: string[] = [];
  vi.doMock('./index', () => ({
    TaskService: class {
      async updateStatus(input: { id: string; status: string }) {
        completed.push(input.id);
      }
    },
  }));
  try {
    await completeAcceptedArtifacts(db, userId, undefined, f.parent.id);
    expect(completed).toEqual([]);
    const { taskTopics } = await import('@/database/schemas/task');
    for (const delivery of f.deliveries.slice(1))
      await db
        .update(taskTopics)
        .set({
          integration: {
            ...delivery.topic.integration!,
            repo: delivery.proof.repo,
            mergedTargetBranch: delivery.proof.targetBranch,
            state: 'integrated',
            integratedSha: 'e'.repeat(40),
          },
        })
        .where(eq(taskTopics.id, delivery.topic.id));
    await completeAcceptedArtifacts(db, userId, undefined, f.parent.id);
    expect(completed).toEqual([f.parent.id]);
  } finally {
    vi.doUnmock('./index');
  }
});

it('a Checklist target changed outside its confirmed plan cannot be finally accepted', async () => {
  const f = await group();
  const child = f.deliveries[1];
  const [aggregate] = await db.select().from(acceptances).where(eq(acceptances.subjectId, f.a.id));
  const proof = { ...child.proof, targetBranch: 'unconfirmed' };
  await db
    .update(acceptances)
    .set({
      metadata: {
        ...aggregate.metadata,
        issueChecklist: { ...aggregate.metadata!.issueChecklist!, targetBranch: 'unconfirmed' },
      },
    })
    .where(eq(acceptances.id, aggregate.id));
  await db
    .update(verifyRuns)
    .set({ metadata: { ...child.run.metadata, issueDelivery: proof } })
    .where(eq(verifyRuns.id, child.run.id));
  const parent = f.deliveries[0];
  await expect(
    new IssueChecklistService(db, userId).acceptDelivery({
      taskId: f.parent.id,
      runId: parent.run.id,
      proof: parent.proof,
    }),
  ).rejects.toThrow('Every current plan delivery');
  expect((await readDeliveryGroup(db, userId, undefined, f.parent)).accepted).toBe(false);
});

it('all planned Done writers require own final acceptance and merge proof, retaining review receipts on valid completion', async () => {
  const f = await group();
  await expect(model().update(f.a.id, { workflowCategory: 'done' })).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  await expect(model().updateStatus(f.a.id, 'completed')).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  await expect(model().updateStatusIfCurrent(f.a.id, 'paused', 'completed')).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  await expect(model().updateStatusForIds([f.a.id], 'completed')).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  const task = (await model().findById(f.a.id))!;
  await expect(
    model().updateStatusForExecutionContract(f.a.id, 'completed', {
      assigneeAgentId: task.assigneeAgentId,
      executionGeneration: task.executionGeneration,
      policyRevision: task.policyRevision,
      requirementRevision: task.requirementRevision,
    }),
  ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  const parent = f.deliveries[0];
  await new IssueChecklistService(db, userId).acceptDelivery({
    taskId: f.parent.id,
    runId: parent.run.id,
    proof: parent.proof,
  });
  await expect(model().updateStatus(f.a.id, 'completed')).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
  const { taskTopics } = await import('@/database/schemas/task');
  const merged = f.deliveries[1];
  await db
    .update(taskTopics)
    .set({
      integration: {
        ...merged.topic.integration!,
        state: 'integrated',
        prNumber: 9,
        prUrl: 'https://github.com/org/repo/pull/9',
        pushedToRemote: true,
        mergedTargetBranch: 'canary',
        integratedSha: 'd'.repeat(40),
      },
    })
    .where(eq(taskTopics.id, merged.topic.id));
  await model().updateStatus(f.a.id, 'completed');
  const after = await readDeliveryGroup(db, userId, undefined, f.parent);
  expect(after.accepted).toBe(true);
  expect(after.proofs[f.a.id].reviewerPassed).toBe(true);
  await expect(model().update(f.parent.id, { workflowCategory: 'done' })).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
  });
});
