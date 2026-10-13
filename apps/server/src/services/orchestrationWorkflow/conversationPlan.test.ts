// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { AcceptanceModel } from '@/database/models/acceptance';
import { MessageModel } from '@/database/models/message';
import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { UserModel } from '@/database/models/user';
import {
  agents,
  messages,
  orchestrationWorkflowEdges,
  orchestrationWorkflowEvents,
  orchestrationWorkflowNodeDecisions,
  orchestrationWorkflowNodes,
  orchestrationWorkflows,
  taskDispatches,
  tasks,
  topics,
  users,
  verifyCriteria,
} from '@/database/schemas';
import { TaskService } from '@/server/services/task';
import { TaskRunnerService } from '@/server/services/taskRunner';

import { advanceOrchestrationWorkflow } from './advanceOrchestrationWorkflow';
import { OrchestrationWorkflowConversationPlanService } from './conversationPlan';
import { OrchestrationWorkflowConversationService } from './conversationState';
import { OrchestrationWorkflowService } from './index';

const db = await getTestDB();
vi.mock('@/database/server', () => ({ getServerDB: async () => db }));
vi.mock('./traceStore', () => ({ createDefaultOrchestrationWorkflowTraceStore: () => null }));
const userId = 'split-test-user';
const context = { agentId: 'split-orchestrator', topicId: 'split-topic' };
const plans = () => new OrchestrationWorkflowConversationPlanService(db, userId);
const input = {
  title: 'Deliver files',
  tasks: [
    {
      title: 'Write Alpha',
      description: 'Scope: alpha.txt only. Acceptance: exactly Alpha. Do not touch beta.txt.',
    },
    {
      title: 'Write Beta',
      description: 'Scope: beta.txt only. Acceptance: exactly Beta.',
      dependsOn: [0],
    },
  ],
};
beforeEach(async () => {
  await db.insert(users).values({ id: userId });
  await db.insert(agents).values({
    id: context.agentId,
    userId,
    agencyConfig: { heterogeneousProvider: { type: 'codex' } },
  });
  await new UserModel(db, userId).updatePreference({ orchestratorAgentId: context.agentId });
  await db.insert(topics).values([
    { id: context.topicId, userId },
    { id: 'other-topic', userId },
  ]);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const table of [
    orchestrationWorkflowNodeDecisions,
    orchestrationWorkflowEdges,
    orchestrationWorkflowEvents,
    orchestrationWorkflowNodes,
    orchestrationWorkflows,
    tasks,
    topics,
    agents,
    users,
  ])
    await db.delete(table);
});
const reply = async (
  id: string,
  role: 'user' | 'assistant' = 'user',
  topicId = context.topicId,
) => {
  const item = await new OrchestrationWorkflowModel(db, userId).findById(id);
  return new MessageModel(db, userId).create({
    role,
    topicId,
    content: 'Yes, proceed',
    createdAt: Date.parse(item!.config!.conversationPlan!.postedAt) + 1000,
  });
};

describe('board split and conversation reply admission', () => {
  it('persists parent/sub-Issues and dependencies before confirmation, but creates no runnable dispatch', async () => {
    const result = await plans().prepare(input, context);
    const issues = await new TaskModel(db, userId).findSubtasks(result.parentTaskId);
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.instruction)).toEqual(
      expect.arrayContaining(input.tasks.map((task) => task.description)),
    );
    expect(
      issues.every(
        (issue) =>
          issue.workflowCategory === 'backlog' && issue.assigneeAgentId === context.agentId,
      ),
    ).toBe(true);
    expect(
      (await new TaskModel(db, userId).getDependencies(result.taskIds[1]))[0].dependsOnId,
    ).toBe(result.taskIds[0]);
    expect(
      (await new OrchestrationWorkflowService(db, userId).tick(result.orchestrationWorkflowId))
        .outcome,
    ).toBe('waiting_human');
    await expect(
      plans().release(result.orchestrationWorkflowId, { ...context, sourceMessageId: 'made-up' }),
    ).rejects.toThrow('AWAITING_USER_REPLY');
    const requested = await new TaskDispatchModel(db).request({
      taskId: result.taskIds[0],
      requestedBy: userId,
      trigger: 'manual',
      origin: 'external',
      idempotencyKey: 'premature',
    });
    if (requested.state === 'busy') throw new Error('Unexpected busy dispatch');
    expect(requested.dispatch).toMatchObject({
      phase: 'waiting',
      waitingReason: 'orchestration_workflow_awaiting_reply',
    });
    const posted = await db
      .select()
      .from(messages)
      .where(
        eq(
          messages.id,
          (await new OrchestrationWorkflowModel(db, userId).findById(
            result.orchestrationWorkflowId,
          ))!.config!.conversationPlan!.postedMessageId,
        ),
      );
    expect(posted[0].content).toContain('Alpha');
  });
  it('only releases on a real later user message in the same conversation and keeps root ownership', async () => {
    const result = await plans().prepare(input, context);
    for (const [role, topicId] of [
      ['assistant', context.topicId],
      ['user', 'other-topic'],
    ] as const) {
      const message = await reply(result.orchestrationWorkflowId, role, topicId);
      await expect(
        plans().release(result.orchestrationWorkflowId, {
          ...context,
          sourceMessageId: message.id,
        }),
      ).rejects.toThrow('AWAITING_USER_REPLY');
    }
    const message = await reply(result.orchestrationWorkflowId);
    await plans().release(result.orchestrationWorkflowId, {
      ...context,
      sourceMessageId: message.id,
    });
    const item = await new OrchestrationWorkflowModel(db, userId).findById(
      result.orchestrationWorkflowId,
    );
    expect(item).toMatchObject({
      agentId: context.agentId,
      status: 'running',
      subjectId: result.parentTaskId,
      config: { planConfirmedAt: expect.any(String) },
    });
    const requested = await new TaskDispatchModel(db).request({
      taskId: result.taskIds[0],
      requestedBy: userId,
      trigger: 'manual',
      origin: 'external',
      idempotencyKey: 'confirmed',
    });
    if (requested.state === 'busy') throw new Error('Unexpected busy dispatch');
    expect(requested.dispatch.phase).toBe('requested');
  });
  it('resets the user-reply boundary after a revised split and survives a service reload', async () => {
    const result = await plans().prepare(input, context);
    const oldReply = await reply(result.orchestrationWorkflowId);
    await db
      .update(messages)
      .set({ createdAt: new Date(0) })
      .where(eq(messages.id, oldReply.id));
    await new TaskModel(db, userId).update(result.taskIds[0], {
      instruction: 'Revised: exactly Alpha, no newline.',
    });
    await plans().post(result.orchestrationWorkflowId, context);
    await expect(
      plans().release(result.orchestrationWorkflowId, { ...context, sourceMessageId: oldReply.id }),
    ).rejects.toThrow('AWAITING_USER_REPLY');
    const freshReply = await reply(result.orchestrationWorkflowId);
    await plans().release(result.orchestrationWorkflowId, {
      ...context,
      sourceMessageId: freshReply.id,
    });
    expect(
      (await new OrchestrationWorkflowModel(db, userId).findById(result.orchestrationWorkflowId))!
        .config!.planConfirmedAt,
    ).toBeTruthy();
  });
  it('refuses a different Agent and ambiguous or cyclic splits without leaving Issues behind', async () => {
    await expect(plans().prepare(input, { ...context, agentId: 'ordinary' })).rejects.toThrow(
      'ORCHESTRATOR_REQUIRED',
    );
    await expect(
      plans().prepare({ ...input, tasks: [input.tasks[0], input.tasks[0]] }, context),
    ).rejects.toThrow('distinct');
    await expect(
      plans().prepare({ ...input, tasks: [{ ...input.tasks[0], dependsOn: [0] }] }, context),
    ).rejects.toThrow('Dependencies');
    expect(await db.select().from(tasks)).toHaveLength(0);
  });
  it('holds added sub-Issues before reposting and synchronizes the edited split and card dependencies', async () => {
    const result = await plans().prepare(input, context);
    const added = await new TaskService(db, userId).createTask({
      name: 'Write Gamma',
      instruction: 'Exactly Gamma',
      parentTaskId: result.parentTaskId,
      assigneeAgentId: context.agentId,
    });
    const requested = await new TaskDispatchModel(db).request({
      taskId: added.id,
      requestedBy: userId,
      trigger: 'manual',
      origin: 'external',
      idempotencyKey: 'added-before-reply',
    });
    if (requested.state === 'busy') throw new Error('Unexpected busy dispatch');
    expect(requested.dispatch.waitingReason).toBe('orchestration_workflow_awaiting_reply');
    await plans().post(result.orchestrationWorkflowId, context);
    const issues = await new OrchestrationWorkflowConversationService(db, userId).listIssues(
      result.orchestrationWorkflowId,
    );
    expect(issues).toHaveLength(3);
    expect(issues.find((issue) => issue.id === result.taskIds[1])!.dependsOn).toEqual([
      result.taskIds[0],
    ]);
    expect(issues.find((issue) => issue.id === added.id)!.parentTaskId).toBe(result.parentTaskId);
  });
  it('does not accept a caller-supplied confirmation stamp', async () => {
    const graph = await new OrchestrationWorkflowService(db, userId).create({
      title: 'Untrusted',
      config: { planConfirmedAt: 'fake' } as never,
    });
    expect(graph.orchestrationWorkflow.config?.planConfirmedAt).toBeUndefined();
    expect(
      (await new OrchestrationWorkflowService(db, userId).tick(graph.orchestrationWorkflow.id))
        .outcome,
    ).toBe('waiting_human');
  });
  it('hands an already materialized Issue to the existing dispatcher after the reply releases the split', async () => {
    const result = await plans().prepare(input, context);
    const message = await reply(result.orchestrationWorkflowId);
    const run = vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({
      operationId: 'dispatched-operation',
      topicId: 'task-topic',
      success: true,
    } as never);
    await plans().release(result.orchestrationWorkflowId, {
      ...context,
      sourceMessageId: message.id,
    });
    await new OrchestrationWorkflowService(db, userId).tick(result.orchestrationWorkflowId);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: result.taskIds[0], trigger: 'orchestrationWorkflow' }),
    );
    const [dispatch] = await db
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.taskId, result.taskIds[0]));
    expect(dispatch.initiator).toBe(userId);
    expect(dispatch.origin).toBe('caid');
  });
  it('rebinds terminal acceptance to the current parent and edited Issue contracts', async () => {
    const result = await plans().prepare(
      { ...input, criteria: [{ title: 'Original Alpha', instruction: 'Exactly Alpha' }] },
      context,
    );
    const model = new OrchestrationWorkflowModel(db, userId);
    const before = await model.findById(result.orchestrationWorkflowId);
    const oldCriteria = before!.config!.acceptance!.criteriaIds!;
    await new TaskModel(db, userId).update(result.parentTaskId, {
      name: 'Deliver Gamma and Beta',
      instruction: 'Scope: Gamma and Beta only. Acceptance: exactly Gamma and Beta.',
    });
    await new TaskModel(db, userId).update(result.taskIds[0], {
      name: 'Write Gamma',
      instruction: 'Scope: gamma.txt only. Acceptance: exactly Gamma.',
    });
    const posted = await plans().post(result.orchestrationWorkflowId, context);
    const revised = await model.findById(result.orchestrationWorkflowId);
    expect(revised?.title).toBe('Deliver Gamma and Beta');
    expect(revised?.requirement).toContain('Gamma and Beta only');
    expect(revised!.config!.acceptance!.criteriaIds).not.toEqual(oldCriteria);
    const criteria = await db.select().from(verifyCriteria);
    const active = criteria.filter((row) =>
      revised!.config!.acceptance!.criteriaIds!.includes(row.id),
    );
    expect(active.map((row) => row.title)).toEqual(
      expect.arrayContaining(['Deliver Gamma and Beta', 'Write Gamma', 'Write Beta']),
    );
    expect(active.map((row) => row.title)).not.toContain('Original Alpha');
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, posted.postedMessageId));
    expect(message.content).toContain('Orchestration workflow: Deliver Gamma and Beta');
  });
  it('preserves the proposed reviewer in the canonical policy and reflects ordinary policy edits', async () => {
    const result = await plans().prepare(
      {
        ...input,
        tasks: input.tasks.map((task) => ({ ...task, reviewerAgentId: context.agentId })),
      },
      context,
    );
    const acceptanceModel = new AcceptanceModel(db, userId);
    const policy = await acceptanceModel.findPolicyBySubject('task', result.taskIds[0]);
    expect(policy?.config?.verifierAgentId).toBe(context.agentId);
    await db.insert(agents).values({ id: 'split-reviewer', title: 'Independent reviewer', userId });
    await acceptanceModel.updatePolicy(policy!.id, {
      config: { ...policy!.config, verifierAgentId: 'split-reviewer' },
    });
    const conversation = new OrchestrationWorkflowConversationService(db, userId);
    expect((await conversation.listIssues(result.orchestrationWorkflowId))[0].reviewerAgentId).toBe(
      'split-reviewer',
    );
    const posted = await plans().post(result.orchestrationWorkflowId, context);
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, posted.postedMessageId));
    expect(message.content).toContain('reviewer Agent: Independent reviewer');
  });
  it('fills both parallel slots in one advance before waiting for worker completion', async () => {
    const result = await plans().prepare(
      {
        ...input,
        config: { maxConcurrentTasks: 2 },
        tasks: input.tasks.map((task) => ({ ...task, dependsOn: [] })),
      },
      context,
    );
    const message = await reply(result.orchestrationWorkflowId);
    const run = vi.spyOn(TaskRunnerService.prototype, 'runTask').mockImplementation(
      async ({ taskId }) =>
        ({
          taskId,
          operationId: `operation-${taskId}`,
          topicId: `topic-${taskId}`,
          success: true,
        }) as never,
    );
    await plans().release(result.orchestrationWorkflowId, {
      ...context,
      sourceMessageId: message.id,
    });
    const advanced = await advanceOrchestrationWorkflow({
      orchestrationWorkflowId: result.orchestrationWorkflowId,
      userId,
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map(([args]) => args.taskId)).toEqual(
      expect.arrayContaining(result.taskIds),
    );
    expect(advanced.result.outcome).toBe('waiting_external');
    expect(advanced.ticks).toBe(3);
  });
});
