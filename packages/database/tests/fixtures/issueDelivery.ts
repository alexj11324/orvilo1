import { randomUUID } from 'node:crypto';

import type { IssueDeliveryProof } from '@orvilo/types';
import { eq } from 'drizzle-orm';

import { agentOperations, agents, tasks, taskTopics, topics } from '../../src/schemas';
import {
  acceptances,
  verifyCheckResults,
  verifyEvidence,
  verifyRuns,
} from '../../src/schemas/verify';
import type { OrviloDatabase } from '../../src/type';

/** Confirm scope without creating a Run, for tests of execution admission. */
export async function seedConfirmedIssuePlan(db: OrviloDatabase, taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task?.createdByUserId) throw new Error('Test Issue requester missing');
  const [aggregate] = await db.select().from(acceptances).where(eq(acceptances.subjectId, taskId));
  const definition = aggregate?.metadata?.issueChecklist ?? {
    revision: 1,
    deliveryKind: 'artifact' as const,
    items: [{ id: 'outcome', title: 'Outcome', required: true }],
    confirmedAt: new Date().toISOString(),
    confirmedBy: task.createdByUserId,
  };
  if (!aggregate)
    await db.insert(acceptances).values({
      userId: task.createdByUserId,
      workspaceId: task.workspaceId,
      subjectType: 'task',
      subjectId: taskId,
      metadata: { issueChecklist: definition },
    });
  const config = (task.config ?? {}) as Record<string, unknown>;
  await db
    .update(tasks)
    .set({
      config:
        definition.deliveryKind === 'code'
          ? { ...config, workspace: { ...(config.workspace as object), repo: definition.repo } }
          : config,
      context: {
        ...(task.context as object),
        issuePlan: {
          revision: 1,
          parentTaskId: taskId,
          confirmedAt: definition.confirmedAt,
          confirmedBy: definition.confirmedBy,
          checklists: [
            {
              taskId,
              expectedRevision: definition.revision - 1,
              items: definition.items,
              deliveryKind: definition.deliveryKind,
              repo: definition.repo,
              targetBranch: definition.targetBranch,
            },
          ],
        },
      },
    })
    .where(eq(tasks.id, taskId));
}

/** Seed an exact reviewed, unaccepted, unmerged delivery for admission tests. */
export async function seedReviewedIssueDelivery(
  db: OrviloDatabase,
  taskId: string,
  options?: {
    seq?: number;
    topicId?: string;
    dispatchId?: string;
    sourceSha?: string;
    baseBranch?: string;
  },
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task?.createdByUserId) throw new Error('Test Issue requester missing');
  const userId = task.createdByUserId;
  const workspaceId = task.workspaceId;
  const seq = options?.seq ?? 1;
  const topicId = options?.topicId ?? `topic-${randomUUID()}`;
  const operationId = `delivery-${randomUUID()}`;
  const reviewerOperationId = `reviewer-${randomUUID()}`;
  const cycleId = randomUUID();
  const reviewerAgentId = `reviewer-${taskId}`;
  await db
    .insert(agents)
    .values({ id: reviewerAgentId, userId, workspaceId })
    .onConflictDoNothing();
  if (!options?.topicId) await db.insert(topics).values({ id: topicId, userId, workspaceId });
  await db.insert(agentOperations).values([
    { id: operationId, userId, workspaceId, taskId, status: 'done' },
    {
      id: reviewerOperationId,
      userId,
      workspaceId,
      taskId,
      agentId: reviewerAgentId,
      status: 'done',
    },
  ]);
  const proof: IssueDeliveryProof = {
    taskId,
    deliveryOperationId: operationId,
    topicId,
    executionGeneration: task.executionGeneration,
    dispatchId: options?.dispatchId,
    sourceSha: options?.sourceSha ?? 'a'.repeat(40),
    repo: 'org/repo',
    branch: `work-${task.identifier}-${seq}`,
    baseBranch: options?.baseBranch ?? 'canary',
    targetBranch: 'canary',
    checklistRevision: 1,
    deliveryKind: 'code',
  };
  const [topic] = await db
    .insert(taskTopics)
    .values({
      taskId,
      topicId,
      operationId,
      userId,
      workspaceId,
      seq,
      dispatchId: proof.dispatchId,
      executionGeneration: proof.executionGeneration,
      status: 'completed',
      integration: {
        role: 'task',
        state: 'verification_pending',
        repo: proof.repo,
        branch: proof.branch,
        baseBranch: proof.baseBranch,
        expectedHeadSha: proof.sourceSha,
      },
    })
    .returning();
  await db
    .update(tasks)
    .set({
      currentTopicId: topicId,
      reviewerAgentId,
      workflowCategory: 'in_review',
      config: {
        issueReview: {
          consecutiveFailures: 0,
          cycleId,
          deliveryOperationId: operationId,
          reviewerAgentId,
          reviewerOperationId,
          state: 'submitted',
          verdict: 'pass',
        },
      },
    })
    .where(eq(tasks.id, taskId));
  const [aggregate] = await db
    .insert(acceptances)
    .values({
      userId,
      workspaceId,
      subjectType: 'task',
      subjectId: taskId,
      metadata: {
        issueChecklist: {
          revision: 1,
          deliveryKind: 'code',
          repo: proof.repo,
          targetBranch: proof.targetBranch,
          confirmedAt: new Date().toISOString(),
          confirmedBy: userId,
          items: [{ id: 'outcome', title: 'Outcome', required: true }],
        },
      },
    })
    .onConflictDoNothing()
    .returning();
  const [existing] = aggregate
    ? [aggregate]
    : await db.select().from(acceptances).where(eq(acceptances.subjectId, taskId));
  const checkItemId = randomUUID();
  const [run] = await db
    .insert(verifyRuns)
    .values({
      userId,
      workspaceId,
      acceptanceId: existing.id,
      roundIndex: seq,
      operationId,
      metadata: {
        issueDelivery: proof,
        issueReviewer: { cycleId, operationId: reviewerOperationId, verdict: 'pass' },
      },
      plan: [
        {
          id: checkItemId,
          title: 'Outcome',
          index: 0,
          required: true,
          onFail: 'manual',
          verifierType: 'agent',
        },
      ],
      status: 'passed',
    })
    .returning();
  const [result] = await db
    .insert(verifyCheckResults)
    .values({
      verifyRunId: run.id,
      userId,
      workspaceId,
      checkItemId,
      verifierType: 'agent',
      verifierOperationId: reviewerOperationId,
      verdict: 'passed',
      status: 'passed',
    })
    .returning();
  await db.insert(verifyEvidence).values({
    userId,
    workspaceId,
    checkResultId: result.id,
    type: 'text',
    content: 'Observed required outcome',
  });
  return { proof, run, result, topic };
}
