// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { AcceptanceModel } from '@/database/models/acceptance';
import { BriefModel } from '@/database/models/brief';
import { GoalModel } from '@/database/models/goal';
import { GoalGraphModel } from '@/database/models/goalGraph';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { VerifyRunModel } from '@/database/models/verifyRun';
import {
  acceptances,
  goalEdges,
  goalEvents,
  goalNodes,
  goals,
  taskDependencies,
  tasks,
  taskTopics,
  topics,
  users,
  workspaces,
} from '@/database/schemas';

import { buildTaskPrompt } from './buildTaskPrompt';

const workspaceId = 'goal-work-prompt-test-workspace';

const db = await getTestDB();
const userId = 'goal-work-prompt-test-user';

beforeEach(async () => {
  await db.insert(users).values({ id: userId }).onConflictDoNothing();
  await db
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: 'Prompt test workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    })
    .onConflictDoNothing();
});

afterEach(async () => {
  await db.delete(acceptances);
  await db.delete(goalEdges);
  await db.delete(goalEvents);
  await db.delete(goalNodes);
  await db.delete(goals);
  await db.delete(taskDependencies);
  await db.delete(taskTopics);
  await db.delete(topics);
  await db.delete(tasks);
  await db.delete(users);
  await db.delete(workspaces);
});

describe('buildTaskPrompt Goal loop context', () => {
  it('uses the per-Task attempt budget for a Goal Graph Task', async () => {
    const taskModel = new TaskModel(db, userId);
    const task = await taskModel.create({
      instruction: 'Close the remaining acceptance gap.',
    });
    await taskModel.update(task.id, { totalTopics: 1 });
    const goal = await new GoalModel(db, userId).create({
      config: { recovery: { maxAttemptsPerTask: 2 } },
      maxRounds: 20,
      subjectType: 'standalone',
      title: 'Graph-managed work budget',
    });
    const graphModel = new GoalGraphModel(db, userId);
    const taskNode = await graphModel.createNode(goal.id, {
      kind: 'task',
      title: 'Close acceptance gap',
    });
    await graphModel.bindTask(goal.id, taskNode!.id, task.id);
    const acceptance = await new AcceptanceModel(db, userId).create({
      subjectType: 'task',
      subjectId: task.id,
    });
    await new VerifyRunModel(db, userId).create({
      acceptanceId: acceptance.id,
      roundIndex: 1,
      metadata: {
        goalReview: {
          status: 'rejected',
          predictionIds: ['prediction-1'],
          feedback:
            'The exported document is missing its table. Restore the table and submit fresh evidence.',
        },
      },
    });
    const currentTask = await taskModel.findById(task.id);

    const result = await buildTaskPrompt(currentTask!, {
      briefModel: new BriefModel(db, userId),
      db,
      taskModel,
      taskTopicModel: new TaskTopicModel(db, userId),
      userId,
    });

    expect(result.prompt).toContain('Automatic Acceptance review:');
    expect(result.prompt).toContain('Review feedback on the last delivery');
    expect(result.prompt).not.toContain('User feedback on the last delivery');
    expect(result.prompt).toContain('Restore the table and submit fresh evidence.');
    expect(result.prompt).toContain('Goal loop — round 2 of 2');
    expect(result.prompt).not.toContain('round 2 of 20');
  });
});

describe('buildTaskPrompt delivery acceptance', () => {
  const buildFor = async (taskId: string) => {
    const taskModel = new TaskModel(db, userId);
    const currentTask = await taskModel.findById(taskId);
    return buildTaskPrompt(currentTask!, {
      briefModel: new BriefModel(db, userId),
      db,
      taskModel,
      taskTopicModel: new TaskTopicModel(db, userId),
      userId,
    });
  };

  it('renders the acceptance section for a plain task with a verify config', async () => {
    const task = await new TaskModel(db, userId).create({
      config: { verify: { enabled: true, requirement: 'The report is delivered as a document.' } },
      instruction: 'Write the report.',
    });

    const result = await buildFor(task.id);

    expect(result.prompt).toContain('Verify — delivery acceptance');
  });

  it('omits the acceptance section for a recurring task', async () => {
    // A recurring task never gets a verify plan instantiated, so its per-tick
    // prompt must not ask the builder to self-evidence acceptance criteria.
    const task = await new TaskModel(db, userId).create({
      automationMode: 'schedule',
      config: { verify: { enabled: true, requirement: 'The report is delivered as a document.' } },
      instruction: 'Send the daily report.',
      schedulePattern: '0 9 * * *',
    });

    const result = await buildFor(task.id);

    expect(result.prompt).not.toContain('Verify — delivery acceptance');
  });
});

describe('buildTaskPrompt dependency receipts (F07/E04–E05)', () => {
  const taskModel = new TaskModel(db, userId, workspaceId);
  const taskTopicModel = new TaskTopicModel(db, userId, workspaceId);

  const seedUpstreamWithDelivery = async () => {
    const upstream = await taskModel.create({
      instruction: 'Upstream delivery.',
      workspaceId,
    });
    const dependent = await taskModel.create({
      instruction: 'Downstream work.',
      workspaceId,
    });
    await db.insert(taskDependencies).values({
      dependsOnId: upstream.id,
      taskId: dependent.id,
      type: 'blocks',
      userId,
      workspaceId,
    });
    const [topic] = await db.insert(topics).values({ userId, workspaceId }).returning();
    return { dependent, upstream, topicId: topic.id };
  };

  const seedCompletedAttempt = async (taskId: string, seq: number) => {
    const [topic] = await db.insert(topics).values({ userId, workspaceId }).returning();
    await db.insert(taskTopics).values({
      integration: {
        attempts: 0,
        baseBranch: 'main',
        branch: `task/UP-${seq}`,
        expectedHeadSha: `sha-head-${seq}`,
        integratedSha: `sha-int-${seq}`,
        role: 'task',
        state: 'integrated',
      },
      seq,
      status: 'completed',
      taskId,
      topicId: topic.id,
      userId,
      workspaceId,
    });
    return topic.id;
  };

  const buildFor = (taskId: string) =>
    taskModel.findById(taskId).then((current) =>
      buildTaskPrompt(current!, {
        briefModel: new BriefModel(db, userId, workspaceId),
        db,
        taskModel,
        taskTopicModel,
        userId,
        workspaceId,
      }),
    );

  it('E05 — freezes a valid receipt when the upstream stands on its delivery', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    const topicId = await seedCompletedAttempt(upstream.id, 1);
    await db.update(tasks).set({ status: 'completed' }).where(eq(tasks.id, upstream.id));

    const result = await buildFor(dependent.id);

    expect(result.contractContent.dependencies).toMatchObject([
      {
        delivery: {
          integratedSha: 'sha-int-1',
          sourceSha: 'sha-head-1',
          topicId,
        },
        deliveryValid: true,
        dependsOnId: upstream.id,
        type: 'blocks',
      },
    ]);
  });

  it('E05 — refuses a fresh claim after the upstream reopened', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    await seedCompletedAttempt(upstream.id, 1);
    // Reopened: the task left 'completed' — the historical delivery can no
    // longer carry a fresh downstream claim.
    await db.update(tasks).set({ status: 'backlog' }).where(eq(tasks.id, upstream.id));

    await expect(buildFor(dependent.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });
  });

  it('E04 — a failed new attempt does not ride on the historical delivery', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    await seedCompletedAttempt(upstream.id, 1);
    // A newer attempt failed: the task no longer stands on the old delivery.
    const [topic2] = await db.insert(topics).values({ userId, workspaceId }).returning();
    await db.insert(taskTopics).values({
      seq: 2,
      status: 'failed',
      taskId: upstream.id,
      topicId: topic2.id,
      userId,
      workspaceId,
    });
    await db.update(tasks).set({ status: 'failed' }).where(eq(tasks.id, upstream.id));

    await expect(buildFor(dependent.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });
  });

  it('propagates a delivery-read failure instead of freezing blind receipts', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    const failingTopicModel = {
      ...taskTopicModel,
      findByTaskId: vi.fn().mockRejectedValue(new Error('db read failed')),
      findWithHandoff: taskTopicModel.findWithHandoff.bind(taskTopicModel),
    } as unknown as TaskTopicModel;
    const current = await taskModel.findById(dependent.id);

    await expect(
      buildTaskPrompt(current!, {
        briefModel: new BriefModel(db, userId, workspaceId),
        db,
        taskModel,
        taskTopicModel: failingTopicModel,
        userId,
        workspaceId,
      }),
    ).rejects.toThrow('db read failed');
    void upstream;
  });
});
