// @vitest-environment node
import type { TaskAttentionReason, TaskWorkflowCategory } from '@orvilo/types';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agentInterventionResolutions,
  agentInterventions,
  agentOperations,
  messagePlugins,
  messages,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
} from '../../schemas';
import type { NewAgentIntervention } from '../../schemas/agentIntervention';
import { TaskModel } from '../task';

const db = await getTestDB();
const ownerId = 'attention-owner';
const otherId = 'attention-other';
const model = new TaskModel(db, ownerId);
let sequence = 0;

const createTask = async (overrides: Partial<typeof tasks.$inferInsert> = {}) => {
  const seq = ++sequence;
  const [task] = await db
    .insert(tasks)
    .values({
      createdByUserId: ownerId,
      id: `attention-task-${seq}`,
      identifier: `ATT-${seq}`,
      instruction: `Attention task ${seq}`,
      position: seq,
      seq,
      visibility: 'private',
      ...overrides,
    })
    .returning();
  return task;
};

const createRun = async (task: typeof tasks.$inferSelect, generation = 1) => {
  const topicId = `topic-${task.id}`;
  const operationId = `op-${task.id}`;
  await db.insert(topics).values({ id: topicId, userId: task.createdByUserId! });
  await db.insert(agentOperations).values({
    id: operationId,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    status: 'running',
    taskId: task.id,
    topicId,
    userId: task.createdByUserId!,
  });
  await db.insert(taskTopics).values({
    executionGeneration: generation,
    operationId,
    seq: 1,
    taskId: task.id,
    topicId,
    userId: task.createdByUserId!,
  });
  await db
    .update(tasks)
    .set({ currentTopicId: topicId, executionGeneration: 1 })
    .where(eq(tasks.id, task.id));
  return { operationId, topicId };
};

const createQuestion = async (
  operationId: string,
  overrides: Partial<NewAgentIntervention> = {},
) => {
  const key = ++sequence;
  const [question] = await db
    .insert(agentInterventions)
    .values({
      activityKey: `activity-${key}`,
      allowedActions: ['submit_answers'],
      batchId: `batch-${key}`,
      deadline: new Date('2027-01-01T00:00:00Z'),
      interactionKind: 'question',
      itemCount: 1,
      itemIndex: 0,
      operationId,
      requestRevisionHash: key.toString(16).padStart(64, 'a'),
      reviewContext: { summary: 'Choose a mode', title: 'Input required' },
      reviewTokenHash: key.toString(16).padStart(64, 'b'),
      sanitizedRequest: { apiName: 'askUserQuestion', identifier: 'test', questions: [] },
      source: 'heterogeneous',
      stepIndex: 0,
      surface: 'form',
      systemActionEligibility: 'review_only',
      toolCallId: `call-${key}`,
      userId: ownerId,
      ...overrides,
    })
    .returning();
  return question;
};

const inputGroups = () =>
  model.groupList({
    groups: [
      { attentionReasons: ['needs_input'], key: 'input' },
      { key: 'backlog', workflowCategories: ['backlog'] },
    ],
  });

beforeEach(async () => {
  await db.delete(agentOperations);
  await db.delete(tasks);
  await db.delete(users);
  await db.insert(users).values([{ id: ownerId }, { id: otherId }]);
  sequence = 0;
});

afterEach(async () => {
  await db.delete(agentOperations);
  await db.delete(tasks);
  await db.delete(users);
});

describe('TaskModel attention groups', () => {
  it('excludes the union of requested attention reasons from normal counts and pages', async () => {
    const input = await createTask({
      context: { execution: { parked: { reason: 'needs_input' } } },
    });
    const failed = await createTask();
    await model.updateStatus(failed.id, 'failed');
    await createTask();
    const normal2 = await createTask();
    const review = await createTask();
    await model.updateStatus(review.id, 'paused', { workflowCategory: 'in_review' });
    const attentionReasons: TaskAttentionReason[] = ['needs_input', 'needs_input'];
    const groups = [
      { attentionReasons, key: 'input', limit: 1 },
      { attentionReasons: ['execution_failed'] as TaskAttentionReason[], key: 'failure' },
      {
        key: 'normal',
        limit: 1,
        offset: 1,
        workflowCategories: ['backlog', 'in_review'] as TaskWorkflowCategory[],
      },
      { key: 'legacy', statuses: ['paused'] },
    ];
    const result = await model.groupList({ groups });
    expect(result[0]).toMatchObject({ hasMore: false, total: 1 });
    expect(result[0].tasks.map((task) => task.id)).toEqual([input.id]);
    expect(result[0].tasks[0].attentionReason).toBe('needs_input');
    expect(result[1].tasks.map((task) => task.id)).toEqual([failed.id]);
    expect(result[1].tasks[0].attentionReason).toBe('execution_failed');
    expect(result[2]).toMatchObject({ hasMore: true, offset: 1, total: 3 });
    expect(result[2].tasks.map((task) => task.id)).toEqual([normal2.id]);
    expect(result[3]).toMatchObject({ hasMore: false, total: 1 });
    expect(result[3].tasks.map((task) => task.id)).toEqual([review.id]);

    const [page] = await model.groupList({
      groups: [
        {
          attentionReasons: ['needs_input', 'execution_failed'],
          key: 'attention',
          limit: 1,
          offset: 1,
        },
      ],
    });
    expect(page).toMatchObject({ hasMore: false, total: 2 });
    expect(page.tasks.map((task) => task.id)).toEqual([failed.id]);
  });

  it('projects settlement contract writes into review and failure groups before normal pagination', async () => {
    await createTask();
    const failed = await createTask();
    const normal2 = await createTask();
    const review = await createTask();
    for (const [task, status] of [
      [failed, 'failed'],
      [review, 'paused'],
    ] as const) {
      const written = await model.updateStatusForExecutionContract(
        task.id,
        status,
        {
          assigneeAgentId: task.assigneeAgentId,
          executionGeneration: task.executionGeneration,
          policyRevision: task.policyRevision,
          requirementRevision: task.requirementRevision,
        },
        status === 'paused' ? { workflowCategory: 'in_review' } : undefined,
      );
      expect(written).not.toBeNull();
    }
    expect((await model.findById(review.id))?.attentionReason).toBe('review_required');
    const [failure, reviews, normal] = await model.groupList({
      groups: [
        { attentionReasons: ['execution_failed'], key: 'failure' },
        { attentionReasons: ['review_required'], key: 'review' },
        { key: 'normal', limit: 1, offset: 1, workflowCategories: ['backlog', 'in_review'] },
      ],
    });
    expect(failure).toMatchObject({ total: 1, hasMore: false });
    expect(failure.tasks).toEqual([
      expect.objectContaining({ id: failed.id, attentionReason: 'execution_failed' }),
    ]);
    expect(reviews).toMatchObject({ total: 1, hasMore: false });
    expect(reviews.tasks).toEqual([
      expect.objectContaining({ id: review.id, attentionReason: 'review_required' }),
    ]);
    expect(normal).toMatchObject({ total: 2, hasMore: false, offset: 1 });
    expect(normal.tasks.map((task) => task.id)).toEqual([normal2.id]);

    const run = await createRun(failed);
    const question = await createQuestion(run.operationId);
    expect((await model.findById(failed.id))?.attentionReason).toBe('needs_input');
    await db
      .update(agentInterventions)
      .set({ status: 'resolved', producerAckAt: new Date() })
      .where(eq(agentInterventions.id, question.id));
    expect((await model.findById(failed.id))?.attentionReason).toBe('execution_failed');
  });

  it.each(['failed', 'outcome_unknown'] as const)(
    'projects the latest %s dispatch and lets a newer active run supersede it',
    async (phase) => {
      const task = await createTask();
      const values = {
        generation: 1,
        id: `dispatch-${task.id}`,
        idempotencyKey: task.id,
        phase,
        policyRevision: task.policyRevision,
        requestedBy: 'user',
        requirementRevision: task.requirementRevision,
        taskId: task.id,
        taskRevision: task.domainRevision,
      };
      await db.insert(taskDispatches).values(values);
      const reason = phase === 'failed' ? 'execution_failed' : 'outcome_unknown';
      expect((await model.findById(task.id))?.attentionReason).toBe(reason);
      // Settle the old unknown lease before starting its successor.
      if (phase === 'outcome_unknown') {
        await db
          .update(taskDispatches)
          .set({ phase: 'abandoned' })
          .where(eq(taskDispatches.id, values.id));
      }
      await db.insert(taskDispatches).values({
        ...values,
        generation: 2,
        id: `next-${task.id}`,
        idempotencyKey: `next-${task.id}`,
        phase: 'running',
      });
      expect((await model.findById(task.id))?.attentionReason).toBe('none');
    },
  );

  it('does not expose another owner private attention tasks or totals', async () => {
    const owned = await createTask({
      context: { execution: { parked: { reason: 'needs_input' } } },
    });
    await createTask({
      createdByUserId: otherId,
      context: { execution: { parked: { reason: 'needs_input' } } },
    });
    const [input] = await inputGroups();
    expect(input).toMatchObject({ hasMore: false, total: 1 });
    expect(input.tasks.map((task) => task.id)).toEqual([owned.id]);
  });

  it('keeps answered heterogeneous questions in attention until producer acknowledgment', async () => {
    const task = await createTask();
    const run = await createRun(task);
    const question = await createQuestion(run.operationId);
    let [input, backlog] = await inputGroups();
    expect(input.tasks.map((task) => task.id)).toEqual([task.id]);
    expect(backlog.total).toBe(0);
    expect(input.tasks[0].attentionReason).toBe('needs_input');

    await db
      .update(agentInterventions)
      .set({ status: 'resolved' })
      .where(eq(agentInterventions.id, question.id));
    [input, backlog] = await inputGroups();
    expect(input.total).toBe(1);
    expect(backlog.total).toBe(0);

    await db
      .update(agentInterventions)
      .set({ producerAckAt: new Date() })
      .where(eq(agentInterventions.id, question.id));
    [input, backlog] = await inputGroups();
    expect(input.total).toBe(0);
    expect(backlog.tasks.map((task) => task.id)).toEqual([task.id]);
    expect(backlog.tasks[0].attentionReason).toBe('none');
  });

  it.each(['cancelled', 'timed_out', 'session_ended'] as const)(
    'keeps a %s current-run question as a durable obligation until superseded',
    async (status) => {
      const task = await createTask();
      const run = await createRun(task);
      await createQuestion(run.operationId, { status });
      let [input, backlog] = await inputGroups();
      expect(input.tasks.map((row) => row.id)).toEqual([task.id]);
      expect(backlog.total).toBe(0);

      await db.update(tasks).set({ executionGeneration: 2 }).where(eq(tasks.id, task.id));
      [input, backlog] = await inputGroups();
      expect(input.total).toBe(0);
      expect(backlog.tasks.map((row) => row.id)).toEqual([task.id]);
    },
  );

  it('clears runtime question attention only after its resolution continuation starts', async () => {
    const task = await createTask();
    const run = await createRun(task);
    const question = await createQuestion(run.operationId, { source: 'runtime' });
    const [resolution] = await db
      .insert(agentInterventionResolutions)
      .values({
        action: { answers: {}, type: 'submit_answers' },
        actorId: ownerId,
        batchId: question.batchId,
        expectedItemCount: 1,
        expectedRequestRevisionHashes: { [question.id]: question.requestRevisionHash },
        expectedVersions: { [question.id]: question.version },
        operationId: run.operationId,
        resolutionRequestId: '00000000-0000-4000-8000-000000000001',
        scope: 'single',
        selectedInterventionIds: [question.id],
        source: 'runtime',
        userId: ownerId,
      })
      .returning();
    await db
      .update(agentInterventions)
      .set({ producerAckAt: new Date(), resolutionId: resolution.id, status: 'resolved' })
      .where(eq(agentInterventions.id, question.id));
    expect((await inputGroups())[0].total).toBe(1);
    await db
      .update(agentInterventionResolutions)
      .set({ continuationStartedAt: new Date() })
      .where(eq(agentInterventionResolutions.id, resolution.id));
    const [input, backlog] = await inputGroups();
    expect(input.total).toBe(0);
    expect(backlog.tasks.map((task) => task.id)).toEqual([task.id]);
  });

  it('ignores unanswered questions from a superseded execution generation', async () => {
    const task = await createTask();
    const run = await createRun(task, 0);
    await createQuestion(run.operationId);
    const [input, backlog] = await inputGroups();
    expect(input.total).toBe(0);
    expect(backlog.tasks.map((task) => task.id)).toEqual([task.id]);
    expect(backlog.tasks[0].attentionReason).toBe('none');
  });

  it('tracks askUserQuestion messages only for the current operation and clears completed answers', async () => {
    const task = await createTask();
    const run = await createRun(task);
    await db.insert(messages).values({
      id: 'attention-message',
      metadata: { heterogeneousToolStateOperationId: 'superseded-operation' },
      role: 'tool',
      topicId: run.topicId,
      userId: ownerId,
    });
    await db.insert(messagePlugins).values({
      apiName: 'askUserQuestion',
      id: 'attention-message',
      toolCallId: 'message-question',
      userId: ownerId,
    });
    expect((await inputGroups())[0].total).toBe(0);
    await db
      .update(messages)
      .set({ metadata: { heterogeneousToolStateOperationId: run.operationId } })
      .where(eq(messages.id, 'attention-message'));
    expect((await inputGroups())[0].total).toBe(1);
    await db
      .update(messagePlugins)
      .set({
        intervention: { status: 'approved' },
        state: {
          heterogeneousIntervention: { resolutionRequestId: 'answered', transition: 'resolved' },
        },
      })
      .where(eq(messagePlugins.id, 'attention-message'));
    const [input, backlog] = await inputGroups();
    expect(input.total).toBe(0);
    expect(backlog.tasks.map((task) => task.id)).toEqual([task.id]);
  });
});
