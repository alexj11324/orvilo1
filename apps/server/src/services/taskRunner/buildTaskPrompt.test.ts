// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { BriefModel } from '@/database/models/brief';
import { GoalModel } from '@/database/models/goal';
import { GoalGraphModel } from '@/database/models/goalGraph';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import {
  goalEdges,
  goalEvents,
  goalNodes,
  goals,
  taskDependencies,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
  workspaceMembers,
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
  await db.insert(workspaceMembers).values({ role: 'owner', userId, workspaceId });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete(goalEdges);
  await db.delete(goalEvents);
  await db.delete(goalNodes);
  await db.delete(goals);
  await db.delete(taskDependencies);
  await db.delete(taskDispatches);
  await db.delete(taskTopics);
  await db.delete(topics);
  await db.delete(tasks);
  await db.delete(users);
  await db.delete(workspaces);
});

describe('buildTaskPrompt Goal loop context', () => {
  it('uses Issue description and reviewer comments for graph work', async () => {
    const taskModel = new TaskModel(db, userId);
    const task = await taskModel.create({
      instruction:
        'Close the remaining acceptance gap. The exported document must include its table.',
      description: 'Short report summary',
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
    await taskModel.addComment({
      taskId: task.id,
      userId,
      content: 'Reviewer feedback: restore the exported table.',
    });
    const currentTask = await taskModel.findById(task.id);

    const result = await buildTaskPrompt(currentTask!, {
      briefModel: new BriefModel(db, userId),
      db,
      taskModel,
      taskTopicModel: new TaskTopicModel(db, userId),
      userId,
    });

    expect(result.prompt).toContain('The exported document must include its table.');
    expect(result.prompt).toContain('Reviewer feedback: restore the exported table.');
    expect(result.prompt).not.toContain('Automatic Acceptance review:');
  });
});

describe('buildTaskPrompt Issue instructions', () => {
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

  it('renders ordinary Issue instructions without retired engine prompts', async () => {
    const task = await new TaskModel(db, userId).create({
      instruction: 'Write the report.',
    });

    const result = await buildFor(task.id);

    expect(result.prompt).not.toContain('Verify — delivery acceptance');
  });

  it('omits the acceptance section for a recurring task', async () => {
    // The recurring prompt uses the published task instruction.
    const task = await new TaskModel(db, userId).create({
      automationMode: 'schedule',
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

  const seedCompletedAttempt = async (
    taskId: string,
    seq: number,
    opts?: { dispatchId?: string; executionGeneration?: number },
  ) => {
    const [topic] = await db.insert(topics).values({ userId, workspaceId }).returning();
    const dispatchId = opts?.dispatchId ?? `dsp-up-${seq}`;
    await db.insert(taskDispatches).values({
      generation: 0,
      id: dispatchId,
      idempotencyKey: `seed:${taskId}:${seq}`,
      // A completed attempt's dispatch is settled — 'requested' (the default)
      // is active and would pin the task at 'running' (and block a second
      // attempt's dispatch on the one-active constraint).
      phase: 'succeeded',
      policyRevision: 0,
      requestedBy: userId,
      requirementRevision: 0,
      taskId,
      taskRevision: 0,
      workspaceId,
    });
    await db.insert(taskTopics).values({
      dispatchId,
      // The receipt binds the dispatch identity + the upstream's execution
      // generation (SA05-A): a completed row without either is not a
      // provable delivery.
      executionGeneration: opts?.executionGeneration ?? 0,
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
    await taskModel.updateStatus(upstream.id, 'completed');

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
        // C02: an agent-produced delivery receipt is recorded as `delivery`
        // evidence — distinct from a human completion.
        evidenceKind: 'delivery',
        type: 'blocks',
      },
    ]);
  });

  it('E05 — refuses a fresh claim after the upstream reopened', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    await seedCompletedAttempt(upstream.id, 1);
    // Reopened: the task left 'completed' — the historical delivery can no
    // longer carry a fresh downstream claim.
    await taskModel.updateStatus(upstream.id, 'backlog');

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
    await taskModel.updateStatus(upstream.id, 'failed');

    await expect(buildFor(dependent.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });
  });

  it('E06 — a manual completion with no run history is itself a valid delivery', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    // Kanban/manual completion: the upstream was never executed, so no
    // taskTopics exist — the 'completed' status is the delivery evidence.
    await taskModel.updateStatus(upstream.id, 'completed');

    const result = await buildFor(dependent.id);

    expect(result.contractContent.dependencies).toMatchObject([
      {
        deliveryValid: true,
        dependsOnId: upstream.id,
        // C02: a human completion is a separate evidence kind — never
        // recorded as a Git/CI delivery receipt.
        evidenceKind: 'manual_completion',
        status: 'completed',
        type: 'blocks',
      },
    ]);
    // No artifact existed — the frozen receipt must record none.
    expect(result.contractContent.dependencies?.[0]?.delivery).toBeUndefined();
  });

  it('E06 — refuses a manual completion contradicted by an in-flight attempt', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    const [topic] = await db.insert(topics).values({ userId, workspaceId }).returning();
    await db.insert(taskTopics).values({
      seq: 1,
      status: 'running',
      taskId: upstream.id,
      topicId: topic.id,
      userId,
      workspaceId,
    });
    await taskModel.updateStatus(upstream.id, 'completed');

    await expect(buildFor(dependent.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });
  });

  it('SA05-A — a delivery from a superseded execution generation is not valid', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    await seedCompletedAttempt(upstream.id, 1, { executionGeneration: 0 });
    // The upstream entered a new generation that failed — the historical
    // completed row no longer names the current delivery.
    await db
      .update(tasks)
      .set({ executionGeneration: 1, status: 'completed' })
      .where(eq(tasks.id, upstream.id));

    await expect(buildFor(dependent.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });
  });

  it('SA05-A — a completed row with no dispatch identity is not a provable delivery', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    const [topic] = await db.insert(topics).values({ userId, workspaceId }).returning();
    // A completed attempt lacking dispatchId/executionGeneration binding —
    // e.g. a hand-written row — cannot anchor a downstream claim.
    await db.insert(taskTopics).values({
      integration: {
        attempts: 0,
        baseBranch: 'main',
        branch: 'task/UP-9',
        expectedHeadSha: 'sha-head-9',
        integratedSha: 'sha-int-9',
        role: 'task',
        state: 'integrated',
      },
      seq: 1,
      status: 'completed',
      taskId: upstream.id,
      topicId: topic.id,
      userId,
      workspaceId,
    });
    await taskModel.updateStatus(upstream.id, 'completed');

    await expect(buildFor(dependent.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });
  });

  it('SA05-A — a revoked integration record invalidates the delivery receipt', async () => {
    const { dependent, upstream } = await seedUpstreamWithDelivery();
    const topicId = await seedCompletedAttempt(upstream.id, 1);
    // Integration revoked: the landed merge was undone, so the historical
    // completed row no longer proves a landed delivery.
    await db
      .update(taskTopics)
      .set({
        integration: {
          attempts: 0,
          baseBranch: 'main',
          branch: 'task/UP-1',
          expectedHeadSha: 'sha-head-1',
          role: 'task',
          state: 'blocked',
        },
      })
      .where(eq(taskTopics.topicId, topicId));
    await taskModel.updateStatus(upstream.id, 'completed');

    await expect(buildFor(dependent.id)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });
  });

  it('SA05-A — a failed dependency-list read blocks the claim instead of freezing an empty contract', async () => {
    const { dependent } = await seedUpstreamWithDelivery();
    vi.spyOn(taskModel, 'getDependencies').mockRejectedValue(new Error('dependency read failed'));
    const failingTaskModel = taskModel;
    const current = await taskModel.findById(dependent.id);

    // The read failure propagates: no prompt, and therefore no authoritative
    // contract with silently-empty dependencies is ever persisted.
    await expect(
      buildTaskPrompt(current!, {
        briefModel: new BriefModel(db, userId, workspaceId),
        db,
        taskModel: failingTaskModel,
        taskTopicModel,
        userId,
        workspaceId,
      }),
    ).rejects.toThrow('dependency read failed');
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
