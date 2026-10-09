// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agentInterventions,
  agentOperations,
  agents,
  messagePlugins,
  messages,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
} from '../../schemas';
import { TaskHandoffRequiredError, TaskModel } from '../task';
import { WorkQueryModel } from '../workQuery';

const db = await getTestDB();
const userId = 'task-input-owner';
const agentId = 'task-input-agent';
const model = new TaskModel(db, userId);
const cleanup = async () => {
  await db.delete(agentOperations).where(eq(agentOperations.userId, userId));
  await db.delete(tasks).where(eq(tasks.createdByUserId, userId));
  await db.delete(topics).where(eq(topics.userId, userId));
  await db.delete(agents).where(eq(agents.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
};
beforeEach(async () => {
  await cleanup();
  await db.insert(users).values({ id: userId });
  await db.insert(agents).values({ id: agentId, slug: agentId, userId });
});
afterEach(cleanup);

// Disposable relational fixtures test the protocol invariant, not Agent runtime acceptance.
const currentRun = async () => {
  const task = await model.create({
    instruction: 'Wait for the actual answer',
    workflowCategory: 'todo',
    assigneeUserId: userId,
    assigneeAgentId: agentId,
  });
  const topicId = `topic_${task.id}`,
    operationId = `op_${task.id}`,
    dispatchId = `dispatch_${task.id}`,
    messageId = `question_${task.id}`;
  await db.insert(topics).values({
    id: topicId,
    userId,
    agentId,
    metadata: { heteroCurrentMsgId: { operationId, msgId: 'producer' } },
  });
  await db.insert(agentOperations).values({
    id: operationId,
    taskId: task.id,
    topicId,
    agentId,
    userId,
    status: 'running',
    startedAt: new Date(),
    appContext: { dispatchId, dispatchFence: 1, executionGeneration: 1 },
  });
  await db.insert(taskDispatches).values({
    id: dispatchId,
    taskId: task.id,
    agentId,
    operationId,
    phase: 'running',
    generation: 1,
    fence: 1,
    taskRevision: 1,
    policyRevision: 1,
    requirementRevision: 1,
    idempotencyKey: dispatchId,
    requestedBy: `manual:${userId}`,
  });
  await db.insert(taskTopics).values({
    taskId: task.id,
    topicId,
    userId,
    operationId,
    dispatchId,
    seq: 1,
    executionGeneration: 1,
    dispatchFence: 1,
    status: 'running',
    runState: 'running',
  });
  await db
    .update(tasks)
    .set({ currentTopicId: topicId, executionGeneration: 1 })
    .where(eq(tasks.id, task.id));
  return { taskId: task.id, topicId, operationId, messageId };
};
const question = async (
  run: Awaited<ReturnType<typeof currentRun>>,
  transition: string,
  status = 'pending',
) => {
  await db.insert(messages).values({
    id: run.messageId,
    userId,
    topicId: run.topicId,
    role: 'tool',
    metadata: { heterogeneousToolStateOperationId: run.operationId },
  });
  await db.insert(messagePlugins).values({
    id: run.messageId,
    userId,
    toolCallId: 'question-call',
    apiName: 'askUserQuestion',
    identifier: 'claude-code',
    intervention: { status: status as 'pending' | 'approved' | 'rejected' },
    state: {
      askUserAnswers: { Scope: 'Attempted' },
      heterogeneousIntervention: { interactionKind: 'question', transition },
    },
  });
};
const rejectsDone = async (write: Promise<unknown>) => {
  try {
    await write;
    throw new Error('Completion unexpectedly accepted');
  } catch (error) {
    const chain = [error, (error as { cause?: unknown }).cause];
    expect(chain.some((item) => (item as { code?: string })?.code === '23514')).toBe(true);
    expect(
      chain.some(
        (item) =>
          (item as { constraint?: string })?.constraint === 'tasks_done_requires_resolved_input',
      ),
    ).toBe(true);
  }
};

describe('current-run required input', () => {
  it.each(['pending', 'timed_out', 'session_ended', 'cancelled'])(
    'rejects direct SQL Done after %s and never lights a waiting border',
    async (transition) => {
      const run = await currentRun();
      expect(await model.hasLiveExecutor(run.taskId)).toBe(true);
      await question(run, transition, transition === 'pending' ? 'pending' : 'rejected');
      expect(await model.hasUnresolvedInput(run.taskId, run.operationId)).toBe(true);
      expect(await model.hasLiveExecutor(run.taskId)).toBe(false);
      await expect(model.update(run.taskId, { assigneeAgentId: null })).rejects.toBeInstanceOf(
        TaskHandoffRequiredError,
      );
      await rejectsDone(
        db.execute(sql`UPDATE tasks SET workflow_category = 'done' WHERE id = ${run.taskId}`),
      );
    },
  );

  it('a published answer is still unmet until the producer ACK; confirmed continuation may finish', async () => {
    const run = await currentRun();
    await question(run, 'pending', 'approved');
    await rejectsDone(model.updateStatus(run.taskId, 'completed'));
    await db
      .update(messagePlugins)
      .set({
        state: {
          askUserAnswers: { Scope: 'Narrow' },
          heterogeneousIntervention: {
            transition: 'resolved',
            resolutionRequestId: 'confirmed-answer-request',
          },
        },
      })
      .where(eq(messagePlugins.id, run.messageId));
    await db.insert(messages).values({
      id: `continued_${run.taskId}`,
      userId,
      topicId: run.topicId,
      role: 'assistant',
      content: 'Continued after the acknowledged answer',
      metadata: { heterogeneousToolStateOperationId: run.operationId },
    });
    expect(await model.hasUnresolvedInput(run.taskId)).toBe(false);
    await model.updateStatus(run.taskId, 'completed');
    expect((await model.findById(run.taskId))?.workflowCategory).toBe('done');
  });

  it('projects unmet input as attention while retaining canonical workflow columns and swimlanes', async () => {
    const run = await currentRun();
    await question(run, 'timed_out', 'rejected');
    expect(await model.findById(run.taskId)).toMatchObject({
      attentionReason: 'needs_input',
      hasLiveExecutor: false,
    });
    const groups = await model.groupList({
      groups: [
        { key: 'needs_input', attentionReasons: ['needs_input'] },
        { key: 'todo', workflowCategories: ['todo'] },
      ],
    });
    expect(groups.find((group) => group.key === 'needs_input')?.tasks.map((row) => row.id)).toEqual(
      [run.taskId],
    );
    expect(groups.find((group) => group.key === 'todo')?.total).toBe(0);
    const board = await new WorkQueryModel(db, userId).queryTasks({
      query: { entityType: 'task', schemaVersion: 1, layout: 'board', groupBy: 'workflowCategory' },
    });
    expect(board.groups?.find((group) => group.key === 'todo')?.tasks.map((row) => row.id)).toEqual(
      [run.taskId],
    );
    expect(board.groups?.some((group) => group.key === 'needs_input')).toBe(false);
    const attention = await new WorkQueryModel(db, userId).queryTasks({
      query: { entityType: 'task', schemaVersion: 1, layout: 'board', groupBy: 'attention' },
    });
    expect(
      attention.groups?.find((group) => group.key === 'needs_input')?.tasks.map((row) => row.id),
    ).toEqual([run.taskId]);
    const lanes = await new WorkQueryModel(db, userId).queryTasks({
      query: {
        entityType: 'task',
        schemaVersion: 1,
        layout: 'board',
        groupBy: 'priority',
        subGroupBy: 'workflowCategory',
      },
    });
    const cell = lanes.groups?.find((group) => group.tasks.some((row) => row.id === run.taskId));
    expect(cell?.key.split('\u001F')[1]).toBe('todo');
    expect(cell?.tasks.find((row) => row.id === run.taskId)?.attentionReason).toBe('needs_input');
  });

  it('generic heterogeneous questions require producer acknowledgement, not only resolved text', async () => {
    const run = await currentRun();
    const [intervention] = await db
      .insert(agentInterventions)
      .values({
        operationId: run.operationId,
        toolCallId: 'generic-question',
        userId,
        source: 'heterogeneous',
        provider: 'claude-code',
        interactionKind: 'question',
        surface: 'form',
        systemActionEligibility: 'review_only',
        batchId: 'question-batch',
        activityKey: 'question-activity',
        stepIndex: 0,
        itemIndex: 0,
        itemCount: 1,
        sealed: true,
        requestRevisionHash: '0'.repeat(64),
        allowedActions: ['submit_answers'],
        reviewTokenHash: '1'.repeat(64),
        reviewContext: { title: 'Answer required' },
        sanitizedRequest: { apiName: 'askUserQuestion' },
        deadline: new Date(Date.now() + 60000),
        status: 'resolved',
      })
      .returning();
    expect(await model.hasUnresolvedInput(run.taskId)).toBe(true);
    await rejectsDone(model.updateStatus(run.taskId, 'completed'));
    await db
      .update(agentInterventions)
      .set({ producerAckAt: new Date() })
      .where(eq(agentInterventions.id, intervention.id));
    expect(await model.hasUnresolvedInput(run.taskId)).toBe(false);
    await model.updateStatus(run.taskId, 'completed');
  });

  it('does not borrow a superseded operation or expose another owner input state', async () => {
    const run = await currentRun();
    await question(run, 'pending');
    expect(await new TaskModel(db, 'not-the-owner').hasUnresolvedInput(run.taskId)).toBe(false);
    expect(await model.hasUnresolvedInput(run.taskId, 'different-operation')).toBe(false);
    await db.update(tasks).set({ executionGeneration: 2 }).where(eq(tasks.id, run.taskId));
    expect(await model.hasUnresolvedInput(run.taskId)).toBe(false);
  });
});
