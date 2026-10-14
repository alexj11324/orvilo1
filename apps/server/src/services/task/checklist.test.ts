// @vitest-environment node
import type { TaskConfig } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { TaskModel } from '@/database/models/task';
import { VerifyRunModel } from '@/database/models/verifyRun';
import {
  agentOperations,
  agents,
  projects,
  taskTopics,
  topics,
  users,
  workspaceMembers,
  workspaces,
} from '@/database/schemas';
import { tasks } from '@/database/schemas/task';
import { verifyCheckResults, verifyRuns } from '@/database/schemas/verify';

import { IssueChecklistService } from './checklist';

const db = await getTestDB();
const owner = 'checklist-owner';
const member = 'checklist-member';
const ws = 'checklist-workspace';
const taskId = 'task_checklist';
const sha = 'a'.repeat(40);
const service = () => new IssueChecklistService(db, owner, ws);

async function delivery(seq = 1, sourceSha = sha) {
  const operationId = `checklist-delivery-${seq}`;
  const topicId = `checklist-topic-${seq}`;
  await db.insert(topics).values({ id: topicId, userId: owner, workspaceId: ws });
  await db
    .insert(agentOperations)
    .values({ id: operationId, userId: owner, workspaceId: ws, taskId, status: 'done' });
  await db.insert(taskTopics).values({
    taskId,
    topicId,
    operationId,
    userId: owner,
    workspaceId: ws,
    seq,
    executionGeneration: seq,
    status: 'completed',
    integration: {
      role: 'task',
      state: 'verification_pending',
      repo: 'org/repo',
      branch: `work-${seq}`,
      baseBranch: seq > 1 ? 'work-1' : 'canary',
      expectedHeadSha: sourceSha,
    },
  });
  await db
    .update(tasks)
    .set({ currentTopicId: topicId, executionGeneration: seq })
    .where(eq(tasks.id, taskId));
  return operationId;
}

async function startReview(operationId: string) {
  const prepared = await service().prepareReview(taskId, operationId);
  const model = new TaskModel(db, owner, ws);
  const cycle = await model.claimIssueReview(taskId, { deliveryOperationId: operationId });
  if (!cycle) throw new Error('Review cycle was not admitted');
  const reviewerOperationId = `checklist-review-${prepared.proof.executionGeneration}`;
  await model.bindIssueReviewOperation(taskId, {
    cycleId: cycle.cycleId,
    operationId: reviewerOperationId,
    actorAgentId: 'checklist-reviewer',
  });
  await db.insert(agentOperations).values({
    id: reviewerOperationId,
    userId: owner,
    workspaceId: ws,
    taskId,
    agentId: 'checklist-reviewer',
    status: 'running',
  });
  return {
    taskId,
    runId: prepared.run.id,
    proof: prepared.proof,
    cycleId: cycle.cycleId,
    reviewerOperationId,
    actorAgentId: 'checklist-reviewer',
    verdict: 'pass' as const,
    items: prepared.run.plan!.map((item) => ({
      checkItemId: item.id,
      verdict: 'pass' as const,
      comment: 'Observed the required outcome',
      evidence: [{ type: 'text' as const, content: 'Executed probe: expected output observed' }],
    })),
  };
}

beforeEach(async () => {
  await db.delete(tasks).where(eq(tasks.id, taskId));
  await db.delete(workspaces).where(eq(workspaces.id, ws));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
  await db.insert(users).values([{ id: owner }, { id: member }]);
  await db
    .insert(workspaces)
    .values({ id: ws, name: 'Checklist QA', slug: ws, primaryOwnerId: owner });
  await db.insert(workspaceMembers).values([
    { workspaceId: ws, userId: owner, role: 'owner' },
    { workspaceId: ws, userId: member, role: 'member' },
  ]);
  await db.insert(agents).values({ id: 'checklist-reviewer', userId: owner, workspaceId: ws });
  await db.insert(tasks).values({
    id: taskId,
    identifier: 'CHECK-1',
    seq: 1,
    instruction: 'Background only',
    createdByUserId: owner,
    workspaceId: ws,
    reviewerAgentId: 'checklist-reviewer',
    workflowCategory: 'in_review',
    executionGeneration: 1,
  });
  await service().confirmChecklist({
    taskId,
    expectedRevision: 0,
    deliveryKind: 'code',
    repo: 'org/repo',
    targetBranch: 'canary',
    items: [{ id: 'outcome', title: 'Required product outcome', required: true }],
  });
});

afterEach(async () => {
  await db.delete(tasks).where(eq(tasks.id, taskId));
  await db.delete(workspaces).where(eq(workspaces.id, ws));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, member));
});

describe('Issue Checklist ledger', () => {
  it('refuses reconfirmation once a delivery round is frozen without stranding the active proof', async () => {
    const input = await startReview(await delivery());
    await expect(
      service().confirmChecklist({
        taskId,
        expectedRevision: 1,
        deliveryKind: 'code',
        repo: 'org/repo',
        targetBranch: 'canary',
        items: [{ id: 'replacement', title: 'Changed acceptance', required: true }],
      }),
    ).rejects.toThrow('frozen');
    await service().submitReviewItems(input);
    await expect(
      service().confirmChecklist({
        taskId,
        expectedRevision: 1,
        deliveryKind: 'code',
        repo: 'org/repo',
        targetBranch: 'canary',
        items: [{ id: 'replacement', title: 'Changed acceptance', required: true }],
      }),
    ).rejects.toThrow('frozen');
    expect((await service().readCurrentDeliveryProof([taskId]))[taskId]).toMatchObject({
      reviewerPassed: true,
      availableForDependents: true,
      proof: input.proof,
    });
  });
  it('Reviewer pass readies the unmerged source while item and final human decisions remain independent', async () => {
    const input = await startReview(await delivery());
    const legacy = new VerifyRunModel(db, owner, ws);
    expect(await legacy.claimTaskDrive(input.runId)).toBeNull();
    expect(await legacy.claimVerifying(input.runId, new Date(Date.now() + 1000))).toBe(false);
    expect(
      (await VerifyRunModel.findStuckVerifying(db, new Date(Date.now() + 1000))).some(
        (run) => run.id === input.runId,
      ),
    ).toBe(false);
    const result = await service().submitReviewItems(input);
    expect(result.task.workflowCategory).toBe('in_review');
    expect(await new TaskModel(db, owner, ws).claimIssueReview(taskId)).toBeNull();
    const before = (await service().readCurrentDeliveryProof([taskId]))[taskId];
    expect(before).toMatchObject({
      availableForDependents: true,
      deliveryAccepted: false,
      itemsAccepted: false,
      merged: false,
    });
    await expect(service().acceptDelivery(input)).rejects.toThrow('item acceptance');
    const rows = await db
      .select()
      .from(verifyCheckResults)
      .where(eq(verifyCheckResults.verifyRunId, input.runId));
    const decision = { ...input, resultIds: rows.map((row) => row.id), action: 'accept' as const };
    await service().reviewChecklistItems(decision);
    expect((await service().readCurrentDeliveryProof([taskId]))[taskId]).toMatchObject({
      itemsAccepted: true,
      deliveryAccepted: false,
      merged: false,
    });
    await service().acceptDelivery(input);
    expect((await service().readCurrentDeliveryProof([taskId]))[taskId]).toMatchObject({
      deliveryAccepted: true,
      merged: false,
    });
    expect((await new TaskModel(db, owner, ws).findById(taskId))?.workflowCategory).toBe(
      'in_review',
    );
    await expect(service().submitReviewItems(input)).rejects.toThrow('cycle');
    await expect(
      service().reviewChecklistItems({ ...decision, action: 'reject', comment: 'new work' }),
    ).rejects.toThrow('historical');
  });

  it('rejects stale source, incomplete evidence and uncertain required outcomes without a verdict write', async () => {
    const input = await startReview(await delivery());
    await expect(
      service().submitReviewItems({
        ...input,
        proof: { ...input.proof, sourceSha: 'b'.repeat(40) },
      }),
    ).rejects.toThrow('revision changed');
    await expect(service().submitReviewItems({ ...input, items: [] })).rejects.toThrow(
      'every Checklist item',
    );
    await expect(
      service().submitReviewItems({
        ...input,
        items: input.items.map((item) => ({ ...item, evidence: [] })),
      }),
    ).rejects.toThrow('real evidence');
    await expect(
      service().submitReviewItems({
        ...input,
        items: input.items.map((item) => ({ ...item, verdict: 'uncertain' })),
      }),
    ).rejects.toThrow('Overall verdict');
    expect(
      await db
        .select()
        .from(verifyCheckResults)
        .where(eq(verifyCheckResults.verifyRunId, input.runId)),
    ).toHaveLength(0);
    expect(
      ((await new TaskModel(db, owner, ws).findById(taskId))?.config as TaskConfig)?.issueReview
        ?.state,
    ).toBe('running');
  });

  it('retains accepted history and creates pending item identities for a later stacked delivery', async () => {
    const input = await startReview(await delivery());
    await service().submitReviewItems(input);
    const [result] = await db
      .select()
      .from(verifyCheckResults)
      .where(eq(verifyCheckResults.verifyRunId, input.runId));
    await service().reviewChecklistItems({ ...input, resultIds: [result.id], action: 'accept' });
    const next = await service().prepareReview(taskId, await delivery(2, 'b'.repeat(40)));
    expect(next.run.plan![0].id).not.toBe(input.items[0].checkItemId);
    expect((await service().readCurrentDeliveryProof([taskId]))[taskId]).toMatchObject({
      availableForDependents: false,
      itemsAccepted: false,
      deliveryAccepted: false,
    });
    expect(
      (await db.select().from(verifyCheckResults).where(eq(verifyCheckResults.id, result.id)))[0]
        .userDecision,
    ).toBe('accepted');
    expect(await db.select().from(verifyRuns)).toHaveLength(2);
  });

  it('does not grant final acceptance to an Issue editor and caps reads at private Project visibility', async () => {
    const input = await startReview(await delivery());
    const other = new IssueChecklistService(db, member, ws);
    await expect(other.acceptDelivery(input)).rejects.toThrow('requester or workspace Owner');
    await db.insert(projects).values({
      id: 'checklist-private-project',
      identifier: 'CHK',
      name: 'Private',
      userId: owner,
      workspaceId: ws,
      visibility: 'private',
    });
    await db
      .update(tasks)
      .set({ projectId: 'checklist-private-project' })
      .where(eq(tasks.id, taskId));
    await expect(other.getChecklist(taskId)).rejects.toThrow('Issue not found');
    expect(await other.readCurrentDeliveryProof([taskId])).toEqual({});
    expect((await service().getChecklist(taskId)).history).toHaveLength(1);
  });
});
