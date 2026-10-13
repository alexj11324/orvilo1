// @vitest-environment node
import { GOAL_COORDINATOR_ACTOR_ID } from '@orvilo/const/goal';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDB } from '@/database/core/getTestDB';
import { AgentOperationModel } from '@/database/models/agentOperation';
import { GoalModel } from '@/database/models/goal';
import type * as GoalGraphModule from '@/database/models/goalGraph';
import { GoalGraphModel } from '@/database/models/goalGraph';
import { MetricModel } from '@/database/models/metric';
import { TaskModel } from '@/database/models/task';
import { legacyStatusExpr } from '@/database/models/taskExecutionSql';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { WorkModel } from '@/database/models/work';
import {
  agentOperations,
  agents,
  goalEdges,
  goalEvents,
  goalNodeDecisions,
  goalNodes,
  goals,
  metricPoints,
  metrics,
  taskDispatches,
  tasks,
  taskTopics,
  topics,
  users,
} from '@/database/schemas';
import type { OrviloDatabase } from '@/database/type';
import { InMemoryAgentStateManager } from '@/server/modules/AgentExecution/InMemoryAgentStateManager';

import { TaskService } from '../task';
import { TaskRunnerService } from '../taskRunner';
import { GoalDecompositionPlannerService } from './decompositionPlanner';
import { GoalExplorationPlanner } from './explorationPlanner';
import { GoalService } from './index';
import type { GoalTickObservation } from './traceObservation';

// A CAID plan patch can land between a tick's graph snapshot and the locked
// claim inside dispatchWork. getGraph is a per-instance field, so the only
// seam is the class itself: the wrapper below injects a late-arriving edge
// only on the transaction handle (this.db !== the service db), which is the
// claim-time re-read. `graphEdgeInjection` is null in every other test, so
// the wrapper is transparent outside this suite.
const graphEdgeInjection = vi.hoisted(() => ({
  current: null as null | { baseDb: unknown; edge: unknown },
}));

vi.mock('@/database/models/goalGraph', async (importOriginal) => {
  const mod = await importOriginal<typeof GoalGraphModule>();
  class InjectableGoalGraphModel extends mod.GoalGraphModel {
    constructor(...args: ConstructorParameters<typeof mod.GoalGraphModel>) {
      super(...args);
      const bound = this.getGraph.bind(this);
      this.getGraph = async (goalId: string) => {
        const current = await bound(goalId);
        const spec = graphEdgeInjection.current;
        if (current && spec && (this as unknown as { db: unknown }).db !== spec.baseDb) {
          current.edges.push(spec.edge as never);
        }
        return current;
      };
    }
  }
  return { ...mod, GoalGraphModel: InjectableGoalGraphModel };
});

// CAID admission (R10) is default-off; this suite exercises the orchestrated
// dispatch path, so admission is allowed by default — one test flips it off.
const caidAdmission = vi.hoisted(() => ({ allowed: vi.fn(async () => true) }));
vi.mock('@/server/featureFlags/caidAdmission', () => ({
  isCaidDispatchAllowed: caidAdmission.allowed,
}));

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'goal-service-test-user';

/**
 * `tasks.status` is retired — fixtures put a task in a legacy state by writing
 * the canonical rows instead of the frozen column. A live run means a
 * `taskDispatches` row in an active phase.
 */
const dispatchFixture = async (
  taskId: string,
  phase: 'requested' | 'running' | 'waiting',
  generation = 1,
) => {
  await serverDB.insert(taskDispatches).values({
    generation,
    id: `disp_${taskId}_${phase}_${generation}`,
    idempotencyKey: `idem_${taskId}_${phase}_${generation}`,
    phase,
    policyRevision: 1,
    requestedBy: 'goal-test',
    requirementRevision: 1,
    taskId,
    taskRevision: 1,
  });
};

const derivedStatus = async (id: string) => {
  const [row] = await serverDB
    .select({ status: legacyStatusExpr })
    .from(tasks)
    .where(eq(tasks.id, id));
  return row?.status;
};

beforeEach(async () => {
  await serverDB.insert(users).values({ id: userId }).onConflictDoNothing();
});

afterEach(async () => {
  vi.restoreAllMocks();
  // PGlite does not consistently order the nested user -> goal -> graph
  // cascades, so clear graph leaves explicitly before their owned roots.
  await serverDB.delete(goalNodeDecisions);
  await serverDB.delete(goalEdges);
  await serverDB.delete(goalEvents);
  await serverDB.delete(goalNodes);
  await serverDB.delete(goals);
  await serverDB.delete(metricPoints);
  await serverDB.delete(metrics);
  await serverDB.delete(agentOperations);
  await serverDB.delete(taskTopics);
  await serverDB.delete(taskDispatches);
  await serverDB.delete(topics);
  await serverDB.delete(tasks);
  await serverDB.delete(agents);
  await serverDB.delete(users);
});

describe('GoalService', () => {
  it('keeps a delivered Issue open until its workflow is done, then achieves without another Task', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      requirement: 'Return evidence for the deliverable.',
      tasks: ['Deliver'],
      title: 'Reviewed goal',
    });
    const created = await service.tick(graph.goal.id);
    const taskModel = new TaskModel(serverDB, userId);
    await serverDB.insert(agents).values({
      id: 'goal-reviewer',
      userId,
      title: 'Reviewer',
      agencyConfig: { heterogeneousProvider: { type: 'codex' } },
    });
    await taskModel.update(created.taskId!, {
      reviewerAgentId: 'goal-reviewer',
      workflowCategory: 'in_review',
    });
    expect(await service.tick(graph.goal.id)).toMatchObject({
      outcome: 'waiting_external',
      taskId: created.taskId,
    });
    expect((await service.graph(graph.goal.id)).goal.status).not.toBe('achieved');
    await taskModel.update(created.taskId!, { workflowCategory: 'done' });
    expect(await service.tick(graph.goal.id)).toMatchObject({ outcome: 'advanced' });
    expect(await service.tick(graph.goal.id)).toMatchObject({ outcome: 'achieved' });
    const finished = await service.graph(graph.goal.id);
    expect(finished.goal.status).toBe('achieved');
    expect(finished.nodes.filter((node) => node.kind === 'task')).toHaveLength(1);
  });

  it('explores after result settlement and dispatches the new graph node through the ordinary Task path', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      title: 'Explore',
      config: { exploration: { instruction: 'Compare evidence', maxExperiments: 3 } },
    });
    const parent = graph.nodes.find((node) => node.kind === 'task')!;
    await serverDB.update(goals).set({ status: 'running' }).where(eq(goals.id, graph.goal.id));
    await serverDB.update(goalNodes).set({ status: 'resolved' }).where(eq(goalNodes.id, parent.id));
    const planner = vi.spyOn(GoalExplorationPlanner.prototype, 'plan').mockResolvedValue({
      action: 'expand',
      parentNodeId: graph.nodes.find((node) => node.kind === 'experiment')!.id,
      title: 'Alternative',
      instruction: 'Improve baseline',
      reason: 'Try a new direction',
    });
    const expanded = await service.tick(graph.goal.id);
    expect(expanded).toMatchObject({ outcome: 'advanced', message: 'Try a new direction' });
    expect(planner).toHaveBeenCalledOnce();
    const created = await service.tick(graph.goal.id);
    expect(created.outcome).toBe('advanced');
    expect(created.nodeId).not.toBe(expanded.nodeId);
    expect((await service.graph(graph.goal.id)).edges).toContainEqual(
      expect.objectContaining({
        sourceNodeId: expanded.nodeId,
        targetNodeId: created.nodeId,
        kind: 'contains',
      }),
    );
    expect(created.taskId).toBeTruthy();
  });

  it('pauses a failed exploration planner without creating a phantom experiment', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      title: 'Explore',
      config: { exploration: { instruction: 'Compare evidence', maxExperiments: 3 } },
    });
    const parent = graph.nodes.find((node) => node.kind === 'task')!;
    await serverDB.update(goals).set({ status: 'running' }).where(eq(goals.id, graph.goal.id));
    await serverDB.update(goalNodes).set({ status: 'resolved' }).where(eq(goalNodes.id, parent.id));
    vi.spyOn(GoalExplorationPlanner.prototype, 'plan').mockRejectedValue(
      new Error('provider unavailable'),
    );
    expect(await service.tick(graph.goal.id)).toMatchObject({ outcome: 'no_progress' });
    const after = await service.graph(graph.goal.id);
    expect(after.goal.status).toBe('paused');
    expect(after.nodes.filter((node) => node.kind === 'task')).toHaveLength(1);
  });

  it('resumes an exhausted exploration only after increasing its cap, preserving explicit user pause', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      title: 'Explore',
      config: { exploration: { instruction: 'Compare evidence', maxExperiments: 1 } },
    });
    const parent = graph.nodes.find((node) => node.kind === 'task')!;
    await serverDB.update(goals).set({ status: 'running' }).where(eq(goals.id, graph.goal.id));
    await serverDB.update(goalNodes).set({ status: 'resolved' }).where(eq(goalNodes.id, parent.id));
    vi.spyOn(GoalExplorationPlanner.prototype, 'plan').mockResolvedValue({
      action: 'expand',
      parentNodeId: parent.id,
      title: 'Alternative',
      instruction: 'Improve baseline',
      reason: 'Still insufficient',
    });
    await service.tick(graph.goal.id);
    expect((await service.setBudget(graph.goal.id, { maxExperiments: 1 })).status).toBe('paused');
    expect((await service.setBudget(graph.goal.id, { maxExperiments: 2 })).status).toBe('running');
    await service.pause(graph.goal.id);
    expect((await service.setBudget(graph.goal.id, { maxExperiments: 3 })).status).toBe('paused');
  });

  it('passes the selected older experiment result into the actual child Task instruction', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      title: 'Text exploration',
      config: { exploration: { instruction: 'Compare alternatives', maxExperiments: 3 } },
    });
    const graphModel = new GoalGraphModel(serverDB, userId);
    const parent = graph.nodes.find((node) => node.kind === 'task')!;
    await serverDB.update(goalNodes).set({ status: 'resolved' }).where(eq(goalNodes.id, parent.id));
    const finding = await graphModel.createNode(graph.goal.id, {
      kind: 'finding',
      title: 'Baseline result',
      description: 'HISTORICAL_EVIDENCE_731: candidate A scored 7.',
    });
    await graphModel.createEdge(graph.goal.id, parent.id, finding!.id, 'produces');
    await graphModel.createNode(graph.goal.id, {
      kind: 'task',
      title: 'Newer alternative',
      status: 'resolved',
    });
    const child = await graphModel.createNode(graph.goal.id, {
      kind: 'task',
      title: 'Revisit baseline',
      description: 'Try changing A',
    });
    await graphModel.createEdge(graph.goal.id, child!.id, parent.id, 'derived_from');
    const created = await service.tick(graph.goal.id);
    const dispatched = await new TaskModel(serverDB, userId).findById(created.taskId!);
    expect(dispatched?.instruction).toContain(parent.id);
    expect(dispatched?.instruction).toContain('HISTORICAL_EVIDENCE_731: candidate A scored 7.');
    expect(dispatched?.instruction).toContain('Try changing A');
  });

  it('creates only one responsible task when ticks race on the same task node', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Single owner task'], title: 'Concurrent goal' });

    const results = await Promise.all([service.tick(graph.goal.id), service.tick(graph.goal.id)]);
    const current = await service.graph(graph.goal.id);
    const taskRows = await serverDB.select().from(tasks);

    expect(results.filter((result) => result.outcome === 'advanced')).toHaveLength(1);
    expect(taskRows).toHaveLength(1);
    expect(current.nodes.find((node) => node.kind === 'task')?.taskId).toBe(taskRows[0].id);
    expect(current.workVersions).toHaveLength(1);
  });

  it('starts the bound Task once when advances race on dispatch', async () => {
    // Overlapping advances (an event hook, a manual nudge, the sweep) both read
    // the task as backlog; without an atomic claim both would call runTask and
    // the user would pay for the same Task twice.
    const runSpy = vi
      .spyOn(TaskRunnerService.prototype, 'runTask')
      .mockImplementation(async ({ taskId }) => ({ taskId }) as never);
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Only run once'], title: 'Raced dispatch' });
    await service.tick(graph.goal.id);

    const results = await Promise.all([service.tick(graph.goal.id), service.tick(graph.goal.id)]);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.message.startsWith('Started task'))).toHaveLength(1);
  });

  it('does not claim or start a Task while CAID dispatch admission is off (R10)', async () => {
    caidAdmission.allowed.mockResolvedValue(false);
    try {
      const runSpy = vi
        .spyOn(TaskRunnerService.prototype, 'runTask')
        .mockImplementation(async ({ taskId }) => ({ taskId }) as never);
      const service = new GoalService(serverDB, userId);
      const graph = await service.create({ title: 'Gated dispatch', tasks: ['Stay gated'] });
      // First tick materializes the task node; the second reaches dispatchWork.
      await service.tick(graph.goal.id);

      const result = await service.tick(graph.goal.id);

      // No claim, no run, no error — the node just waits for admission to open.
      expect(result.outcome).toBe('waiting_external');
      expect(result.reason).toBe('caid_dispatch_disabled');
      expect(await service.graph(graph.goal.id)).toMatchObject({
        orchestrationAdmission: 'disabled',
        orchestrationAdmissionReason: 'caid_dispatch_disabled',
      });
      expect(await new TaskService(serverDB, userId).getTaskDetail(result.taskId!)).toMatchObject({
        orchestrationAdmission: 'disabled',
        orchestrationAdmissionReason: 'caid_dispatch_disabled',
      });
      expect(result.message).toContain('CAID dispatch admission');
      expect(runSpy).not.toHaveBeenCalled();
      expect(await derivedStatus(result.taskId!)).not.toBe('running');
    } finally {
      caidAdmission.allowed.mockResolvedValue(true);
    }
  });

  it('hands back a dispatch claim whose worker died before the run existed', async () => {
    // The claim is taken just before `runTask` creates the topic. If the worker
    // dies in that sliver the task is `running` with no operation to reclaim,
    // and every later advance would report `waiting_external` forever.
    const runSpy = vi
      .spyOn(TaskRunnerService.prototype, 'runTask')
      .mockRejectedValue(new Error('worker died'));
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Start me'], title: 'Orphaned claim' });
    const created = await service.tick(graph.goal.id);

    // The claim survives the crash: put the row back where a dead worker left it.
    await expect(service.tick(graph.goal.id)).rejects.toThrow('worker died');
    await dispatchFixture(created.taskId!, 'running');
    await serverDB
      .update(tasks)
      .set({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(tasks.id, created.taskId!));

    const released = await service.tick(graph.goal.id);

    expect(released.outcome).toBe('advanced');
    // The orphaned claim abandons — the task parks for recovery, it does not
    // silently become dispatchable again.
    expect(await derivedStatus(created.taskId!)).toBe('paused');
    runSpy.mockRestore();
  });

  it('links what the task delivered to its node, and skips the task Work itself', async () => {
    // The deliverable used to survive only as a URL inside the finding's prose:
    // the graph recorded that a task finished but not what came out of it.
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const workModel = new WorkModel(serverDB, userId);
    const graph = await service.create({ tasks: ['Deliver me'], title: 'Harvest deliverables' });
    const created = await service.tick(graph.goal.id);
    await serverDB.insert(taskTopics).values({
      handoff: { summary: 'Delivered', title: 'Delivered title' },
      operationId: 'op-delivered',
      seq: 1,
      status: 'completed',
      taskId: created.taskId!,
      userId,
    });
    await workModel.registerExternal({
      changeType: 'created',
      identifier: 'ENG-7',
      resourceId: 'alexj11324/orvilo1#7',
      resourceType: 'github_issue',
      rootOperationId: 'op-delivered',
      title: 'The delivered issue',
      toolIdentifier: 'orvilo-github',
      toolName: 'createIssue',
    });
    await taskModel.updateStatus(created.taskId!, 'completed');

    await service.tick(graph.goal.id);

    const snapshot = await service.graph(graph.goal.id);
    const linked = snapshot.workVersions.filter((link) => link.nodeId === created.nodeId);
    expect(linked.some((link) => link.work?.title === 'The delivered issue')).toBe(true);
    // The responsible task's own Work is still linked — it is the execution
    // container, and the client is what filters it out of the deliverable list.
    expect(linked.some((link) => link.work?.type === 'task')).toBe(true);
  });

  it('re-settling a task does not duplicate its deliverable links', async () => {
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const workModel = new WorkModel(serverDB, userId);
    const graph = await service.create({ tasks: ['Deliver me'], title: 'Idempotent harvest' });
    const created = await service.tick(graph.goal.id);
    await serverDB.insert(taskTopics).values({
      handoff: { summary: 'Delivered', title: 'Delivered title' },
      operationId: 'op-delivered',
      seq: 1,
      status: 'completed',
      taskId: created.taskId!,
      userId,
    });
    await workModel.registerExternal({
      changeType: 'created',
      resourceId: 'alexj11324/orvilo1#8',
      resourceType: 'github_issue',
      rootOperationId: 'op-delivered',
      title: 'Delivered once',
      toolIdentifier: 'orvilo-github',
      toolName: 'createIssue',
    });
    await taskModel.updateStatus(created.taskId!, 'completed');

    await service.tick(graph.goal.id);
    await service.tick(graph.goal.id);

    const snapshot = await service.graph(graph.goal.id);
    const delivered = snapshot.workVersions.filter(
      (link) => link.nodeId === created.nodeId && link.work?.title === 'Delivered once',
    );
    expect(delivered).toHaveLength(1);
  });

  it('leaves a fresh dispatch claim alone', async () => {
    // The same shape a moment after the claim is just a run about to start.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockRejectedValue(new Error('worker died'));
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Start me'], title: 'Fresh claim' });
    const created = await service.tick(graph.goal.id);
    await expect(service.tick(graph.goal.id)).rejects.toThrow('worker died');
    await dispatchFixture(created.taskId!, 'running');

    const result = await service.tick(graph.goal.id);

    expect(result.outcome).toBe('waiting_external');
    expect(await derivedStatus(created.taskId!)).toBe('running');
  });

  it('reopens a goal its round budget stopped when the budget is raised', async () => {
    // `tick` refuses to move a paused goal, so without this the queued advance
    // returns straight away and the user has to find Resume as a second gesture.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      maxRounds: 1,
      title: 'Budget stopped',
      tasks: ['Costs a round'],
    });
    const created = await service.tick(graph.goal.id);
    await serverDB.insert(topics).values({ id: 'tpc_budget', userId });
    await serverDB
      .insert(taskTopics)
      .values({ seq: 1, taskId: created.taskId!, topicId: 'tpc_budget', userId });

    const stopped = await service.tick(graph.goal.id);
    expect(stopped.outcome).toBe('no_progress');
    expect(stopped.message).toContain('Round budget reached');
    expect((await service.graph(graph.goal.id)).goal.status).toBe('paused');

    const raised = await service.setBudget(graph.goal.id, { maxRounds: 5 });

    expect(raised?.status).not.toBe('paused');
  });

  it('ships the spend the budget is enforced against with the graph', async () => {
    // The header renders `spent / cap` as one fraction, so the number it shows
    // has to be the number the coordinator will stop on — not the goal list's
    // subtree roll-up, which counts Tasks the graph's Tasks spawned.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      maxTotalCost: 10,
      tasks: ['Costs money'],
      title: 'Spend',
    });
    const created = await service.tick(graph.goal.id);

    await serverDB
      .insert(topics)
      .values({ id: 'tpc_spend_1', totalCost: 6.4, totalTokens: 1200, userId });
    await serverDB
      .insert(taskTopics)
      .values({ seq: 1, taskId: created.taskId!, topicId: 'tpc_spend_1', userId });
    // A run that has not settled is a round with no cost yet.
    await serverDB.insert(topics).values({ id: 'tpc_spend_2', userId });
    await serverDB
      .insert(taskTopics)
      .values({ seq: 2, taskId: created.taskId!, topicId: 'tpc_spend_2', userId });

    const { spend } = await service.graph(graph.goal.id);

    expect(spend).toMatchObject({ runs: 2, totalCost: 6.4, totalTokens: 1200 });
    // The cost panel lists WHERE the money went, so the same read carries the
    // per-Task split rather than only the total the budget is checked against.
    expect(spend?.byTask).toEqual([
      { runs: 2, taskId: created.taskId!, totalCost: 6.4, totalTokens: 1200 },
    ]);
  });

  it('keeps an existing deadline when only the cost cap is edited', async () => {
    // The budget panel sends one dimension at a time; an omitted deadline used
    // to be written back as null, silently dropping a calendar budget someone
    // set from a click that only meant to raise the dollars.
    const service = new GoalService(serverDB, userId);
    const deadline = new Date(Date.now() + 3_600_000).toISOString();
    const graph = await service.create({
      config: { schedule: { deadline } },
      tasks: ['Bounded'],
      title: 'Deadline keeper',
    });

    const updated = await service.setBudget(graph.goal.id, { maxTotalCost: 25 });

    expect(updated?.config?.schedule?.deadline).toBe(deadline);
    expect(Number(updated?.maxTotalCost)).toBe(25);
  });

  it('leaves the round cap alone when only the cost cap is edited', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      maxRounds: 7,
      tasks: ['Bounded'],
      title: 'Round keeper',
    });

    const updated = await service.setBudget(graph.goal.id, { maxTotalCost: 25 });

    expect(updated?.maxRounds).toBe(7);
  });

  it('edits the standing requirement in place', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      requirement: '初版验收',
      tasks: ['A'],
      title: 'Editable',
    });

    const updated = await service.updateRequirement(graph.goal.id, '改过的验收标准');

    expect(updated.requirement).toBe('改过的验收标准');
    expect((await service.graph(graph.goal.id)).goal.requirement).toBe('改过的验收标准');
    await expect(service.updateRequirement('goal_missing', 'x')).rejects.toThrow();
  });

  it('hands the goal and its unfinished tasks to a new agent', async () => {
    await serverDB.insert(agents).values([
      {
        agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
        id: 'agt_old',
        slug: 'agt-old',
        userId,
      },
      {
        agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
        id: 'agt_new',
        slug: 'agt-new',
        userId,
      },
    ]);
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({
      agentId: 'agt_old',
      tasks: ['Only task'],
      title: 'Handover',
    });
    const created = await service.tick(graph.goal.id);
    expect((await taskModel.findById(created.taskId!))?.assigneeAgentId).toBe('agt_old');

    const handed = await service.setAgent(graph.goal.id, 'agt_new');

    expect(handed.goal.agentId).toBe('agt_new');
    expect(handed.reassignedTaskIds).toEqual([created.taskId]);
    expect((await taskModel.findById(created.taskId!))?.assigneeAgentId).toBe('agt_new');

    // A finished task keeps the agent that did the work, and `goalOnly` limits
    // the change to future coordinator-created tasks.
    await taskModel.updateStatus(created.taskId!, 'completed');
    const back = await service.setAgent(graph.goal.id, 'agt_old');
    expect(back.reassignedTaskIds).toEqual([]);
    expect((await taskModel.findById(created.taskId!))?.assigneeAgentId).toBe('agt_new');

    await expect(service.setAgent(graph.goal.id, 'agt_missing')).rejects.toThrow();
  });

  it('refuses to bind a goal to an agent whose engine cannot mount the builtin tool surface', async () => {
    await serverDB.insert(agents).values([
      {
        agencyConfig: { heterogeneousProvider: { type: 'devin' } },
        id: 'agt_devin',
        slug: 'agt-devin',
        userId,
      },
      {
        agencyConfig: { heterogeneousProvider: { type: 'pi' } },
        id: 'agt_pi',
        slug: 'agt-pi',
        userId,
      },
    ]);
    const service = new GoalService(serverDB, userId);

    // Every Task a goal mints needs the MCP tool surface — both a bridge that
    // silently drops mcpServers (pi) and an engine with no ACP transport
    // (devin) are refused at bind time instead of failing every dispatch.
    for (const agentId of ['agt_devin', 'agt_pi']) {
      await expect(service.create({ agentId, title: 'Refused' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
    }

    const graph = await service.create({ title: 'Bindable' });
    await expect(service.setAgent(graph.goal.id, 'agt_devin')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(service.restart(graph.goal.id, { agentId: 'agt_pi' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect((await service.graph(graph.goal.id)).goal.agentId).toBeFalsy();
  });

  it('still binds a mount-capable heterogeneous agent', async () => {
    await serverDB.insert(agents).values({
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
      id: 'agt_claude',
      slug: 'agt-claude',
      userId,
    });
    const service = new GoalService(serverDB, userId);

    const graph = await service.create({ agentId: 'agt_claude', title: 'Capable' });

    expect(graph.goal.agentId).toBe('agt_claude');
  });

  it('restarts unfinished tasks under a new agent and cancels the stale runs they hold', async () => {
    const cancelSpy = vi.spyOn(TaskService.prototype, 'cancelTopic').mockResolvedValue();
    await serverDB.insert(agents).values({
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
      id: 'agt_restart',
      slug: 'agt-restart',
      userId,
    });
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({ tasks: ['Stuck task'], title: 'Restartable' });
    const created = await service.tick(graph.goal.id);
    await serverDB.insert(topics).values({ id: 'tpc_restart', userId });
    await new TaskTopicModel(serverDB, userId).add(created.taskId!, 'tpc_restart', { seq: 1 });
    await new TaskTopicModel(serverDB, userId).updateStatus(
      created.taskId!,
      'tpc_restart',
      'running',
    );
    await taskModel.update(created.taskId!, { error: 'lease expired' });
    await dispatchFixture(created.taskId!, 'running');

    const result = await service.restart(graph.goal.id, { agentId: 'agt_restart' });

    expect(cancelSpy).toHaveBeenCalledWith('tpc_restart');
    expect(result.goal.agentId).toBe('agt_restart');
    expect(result.restartedTaskIds).toEqual([created.taskId]);
    expect(await taskModel.findById(created.taskId!)).toMatchObject({
      assigneeAgentId: 'agt_restart',
      error: null,
    });

    // "Start over" on a parked goal must begin ticking again without a second
    // Resume gesture.
    await service.pause(graph.goal.id);
    const resumed = await service.restart(graph.goal.id);
    expect(resumed.goal.status).not.toBe('paused');
  });

  it('cancels the failure gate a restart supersedes so the goal starts moving again', async () => {
    // A restarted task's pending recovery gate is answered by the restart
    // itself. Left pending, it keeps winning the coordinator's
    // pending-decision branch and the goal sits waiting_human with every task
    // freshly reset.
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({ tasks: ['Risky task'], title: 'Restart clears gate' });
    const created = await service.tick(graph.goal.id);
    await taskModel.updateStatus(created.taskId!, 'paused', { error: 'Verifier rejected output' });
    expect((await service.tick(graph.goal.id)).outcome).toBe('waiting_human');

    const result = await service.restart(graph.goal.id);

    expect(result.restartedTaskIds).toEqual([created.taskId]);
    const after = await service.graph(graph.goal.id);
    expect(after.decisions[0].status).toBe('canceled');
    // The freed coordinator dispatches the reset task instead of re-parking.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const next = await service.tick(graph.goal.id);
    expect(next.outcome).not.toBe('waiting_human');
  });

  it('leaves a deliberately paused goal paused when its budget changes', async () => {
    // Nothing distinguishes a user pause from a budget pause on the row, so the
    // reopen is limited to goals whose budget was actually binding.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Wait'], title: 'User paused' });
    await service.pause(graph.goal.id);

    const updated = await service.setBudget(graph.goal.id, { maxTotalCost: 50 });

    expect(updated?.status).toBe('paused');
  });

  it('refuses to delete a goal whose running Task cannot be stopped', async () => {
    // Deleting anyway would remove the only surface that can stop an operation
    // which keeps spending.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Runs on'], title: 'Unstoppable' });
    const created = await service.tick(graph.goal.id);
    await serverDB.insert(topics).values({ id: 'tpc_stuck', userId });
    await new TaskTopicModel(serverDB, userId).add(created.taskId!, 'tpc_stuck', { seq: 1 });
    await new TaskTopicModel(serverDB, userId).updateStatus(
      created.taskId!,
      'tpc_stuck',
      'running',
    );
    vi.spyOn(TaskService.prototype, 'cancelTopic').mockRejectedValue(new Error('gateway is down'));

    await expect(service.delete(graph.goal.id)).rejects.toThrow(/not deleted/);
    expect(await service.graph(graph.goal.id)).toBeDefined();
  });

  it('attaches seed tasks straight to the problem instead of wrapping each in an experiment', async () => {
    // An experiment is a candidate answer under test. A caller-supplied seed is
    // ordinary work, so it takes the same shape as a planned or manager-submitted
    // Task: a `decomposes` edge from the problem, no answer container.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ title: 'Question', tasks: ['Seed work'] });
    const question = graph.nodes.find((n) => n.kind === 'problem')!;
    const task = graph.nodes.find((n) => n.kind === 'task')!;
    expect(graph.goal.config?.exploration).toBeUndefined();
    expect(graph.nodes.filter((n) => n.kind === 'experiment')).toHaveLength(0);
    expect(graph.edges).toEqual([
      expect.objectContaining({
        kind: 'decomposes',
        sourceNodeId: question.id,
        targetNodeId: task.id,
      }),
    ]);
  });

  it('seeds the exploration baseline inside an experiment container', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      config: { exploration: { instruction: 'Compare evidence', maxExperiments: 3 } },
      title: 'Explore',
    });
    const question = graph.nodes.find((n) => n.kind === 'problem')!;
    const answer = graph.nodes.find((n) => n.kind === 'experiment')!;
    const task = graph.nodes.find((n) => n.kind === 'task')!;
    expect(answer.taskId).toBeNull();
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'answers',
          sourceNodeId: answer.id,
          targetNodeId: question.id,
        }),
        expect.objectContaining({
          kind: 'contains',
          sourceNodeId: answer.id,
          targetNodeId: task.id,
        }),
      ]),
    );
  });

  it('plans the decomposition when a goal has no tasks yet', async () => {
    vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose').mockResolvedValue({
      problemStatement: '核心问题的一句话陈述',
      tasks: [
        { dependsOn: [], hypothesis: null, instruction: '收集原始材料', title: '方向A:收集' },
        {
          dependsOn: [0],
          hypothesis: '按模块聚类比按时间排序更能暴露根因',
          instruction: '分析并综合结论',
          title: '方向B:分析',
        },
        // Self and forward references are planner hallucinations — dropped.
        { dependsOn: [1, 2, 9], instruction: '汇编最终报告', title: '方向C:汇编' },
      ],
    });
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      problemDescription: '用户的原话',
      requirement: '完整需求与验收标准全文',
      title: 'Complex ask',
    });
    // The seeded graph carries the user's own words, not the contract blob.
    expect(graph.nodes.find((n) => n.kind === 'problem')?.description).toBe('用户的原话');
    expect(graph.nodes.filter((n) => n.kind === 'task')).toHaveLength(0);

    const result = await service.tick(graph.goal.id);

    expect(result.outcome).toBe('advanced');
    const after = await service.graph(graph.goal.id);
    expect(after.nodes.filter((n) => n.kind === 'task').map((n) => n.title)).toEqual([
      '方向A:收集',
      '方向B:分析',
      '方向C:汇编',
    ]);
    const problem = after.nodes.find((n) => n.kind === 'problem')!;
    expect(problem.description).toBe('核心问题的一句话陈述');

    // Only the direction the planner marked as a hypothesis becomes a candidate
    // answer: one experiment answering the problem and containing that Task.
    // The certain steps attach straight to the problem.
    const byTitle = new Map(after.nodes.map((n) => [n.title, n.id]));
    const experiments = after.nodes.filter((n) => n.kind === 'experiment');
    expect(experiments).toHaveLength(1);
    expect(experiments[0]).toMatchObject({
      description: '按模块聚类比按时间排序更能暴露根因',
      title: '方向B:分析',
    });
    expect(after.edges.filter((e) => e.kind === 'answers')).toEqual([
      expect.objectContaining({ sourceNodeId: experiments[0].id, targetNodeId: problem.id }),
    ]);
    expect(after.edges.filter((e) => e.kind === 'contains')).toEqual([
      expect.objectContaining({
        sourceNodeId: experiments[0].id,
        targetNodeId: byTitle.get('方向B:分析'),
      }),
    ]);
    expect(
      after.edges
        .filter((e) => e.kind === 'decomposes' && e.sourceNodeId === problem.id)
        .map((e) => e.targetNodeId)
        .sort(),
    ).toEqual([byTitle.get('方向A:收集'), byTitle.get('方向C:汇编')].sort());

    // The planner's dependsOn indices become depends_on edges, dependent →
    // prerequisite; the self and forward references were dropped.
    const deps = after.edges
      .filter((e) => e.kind === 'depends_on')
      .map((e) => [e.sourceNodeId, e.targetNodeId]);
    expect(deps).toHaveLength(2);
    expect(deps).toEqual(
      expect.arrayContaining([
        [byTitle.get('方向B:分析'), byTitle.get('方向A:收集')],
        [byTitle.get('方向C:汇编'), byTitle.get('方向B:分析')],
      ]),
    );
  });

  it('plans a goal without hypotheses as plain tasks under the problem', async () => {
    vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose').mockResolvedValue({
      problemStatement: '修好最近三天的 bug',
      tasks: [
        { dependsOn: [], hypothesis: null, instruction: '列出 issue', title: '建立清单' },
        { dependsOn: [0], hypothesis: null, instruction: '逐项修复', title: '实施修复' },
      ],
    });
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ title: 'Bug sweep' });

    expect((await service.tick(graph.goal.id)).outcome).toBe('advanced');

    const after = await service.graph(graph.goal.id);
    const problem = after.nodes.find((n) => n.kind === 'problem')!;
    const taskIds = after.nodes.filter((n) => n.kind === 'task').map((n) => n.id);
    expect(taskIds).toHaveLength(2);
    expect(after.nodes.filter((n) => n.kind === 'experiment')).toHaveLength(0);
    expect(after.edges.filter((e) => e.kind === 'answers' || e.kind === 'contains')).toHaveLength(
      0,
    );
    expect(
      after.edges
        .filter((e) => e.kind === 'decomposes' && e.sourceNodeId === problem.id)
        .map((e) => e.targetNodeId)
        .sort(),
    ).toEqual([...taskIds].sort());
    expect(after.edges.filter((e) => e.kind === 'depends_on')).toHaveLength(1);
  });

  it('plans the decomposition once when two advances race through the planner', async () => {
    // The queued kickoff and the client's fire-and-forget fallback can both
    // reach plan_decomposition together; the atomic planning claim must stop
    // the loser BEFORE the planner call, so nothing double-plans or double-pays.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let plannerCalls = 0;
    vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose').mockImplementation(
      async () => {
        plannerCalls += 1;
        await gate;
        return {
          problemStatement: '并发规划',
          tasks: [
            { dependsOn: [], instruction: '收集', title: '方向A' },
            { dependsOn: [0], instruction: '分析', title: '方向B' },
          ],
        };
      },
    );
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ problemDescription: '原话', title: 'Raced planning' });

    const ticks = Promise.all([service.tick(graph.goal.id), service.tick(graph.goal.id)]);
    // The winner holds the planner open; the loser must lose the claim and
    // return without ever entering it.
    await vi.waitFor(() => expect(plannerCalls).toBe(1));
    release();
    const results = await ticks;

    expect(plannerCalls).toBe(1);
    expect(results.filter((r) => r.outcome === 'advanced')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'waiting_external')).toHaveLength(1);
    const after = await service.graph(graph.goal.id);
    expect(after.nodes.filter((n) => n.kind === 'task')).toHaveLength(2);
    expect(after.edges.filter((e) => e.kind === 'depends_on')).toHaveLength(1);
  });

  it('waits for an unfenced legacy planner instead of generating a second graph', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ title: 'Legacy in-flight planning' });
    // The pre-lease binary claimed only the status, without a checkpoint.
    await serverDB.update(goals).set({ status: 'running' }).where(eq(goals.id, graph.goal.id));
    const planner = vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose');

    expect((await service.tick(graph.goal.id)).outcome).toBe('waiting_external');
    expect(planner).not.toHaveBeenCalled();
    expect(
      (await service.graph(graph.goal.id)).nodes.filter((node) => node.kind === 'task'),
    ).toHaveLength(0);
  });

  it('does not call the planner again when a late advance sees running with no tasks', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const planner = vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose');
    planner.mockImplementationOnce(async () => {
      await gate;
      return {
        problemStatement: 'First plan',
        tasks: [{ instruction: 'Collect sources', title: 'Original research' }],
      };
    });
    planner.mockResolvedValue({
      problemStatement: 'Second plan',
      tasks: [{ instruction: 'Collect sources', title: 'Equivalent research' }],
    });
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ title: 'Staggered planning' });
    const first = service.tick(graph.goal.id);
    try {
      await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
      // The initial claim already changed the status, but has not produced any tasks.
      expect((await service.graph(graph.goal.id)).goal.status).toBe('running');
      const late = await new GoalService(serverDB, userId).tick(graph.goal.id);
      expect(late.outcome).toBe('waiting_external');
      expect(planner).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await first;
    }
    const after = await service.graph(graph.goal.id);
    expect(after.nodes.filter((node) => node.kind === 'task')).toHaveLength(1);
    expect(after.nodes.filter((node) => node.kind === 'experiment')).toHaveLength(0);
    expect(after.nodes.find((node) => node.kind === 'problem')?.description).toBe('First plan');
    expect(after.edges.filter((edge) => edge.kind === 'decomposes')).toHaveLength(1);
  });

  it('rejects a late planner after an expired lease is taken over', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const planner = vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose');
    planner.mockImplementationOnce(async () => {
      await gate;
      return { problemStatement: 'Stale plan', tasks: [{ instruction: 'Old', title: 'Old task' }] };
    });
    planner.mockResolvedValue({
      problemStatement: 'Recovered plan',
      tasks: [{ instruction: 'New', title: 'New task' }],
    });
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ title: 'Lease recovery' });
    const first = service.tick(graph.goal.id);
    try {
      await vi.waitFor(() => expect(planner).toHaveBeenCalledTimes(1));
      const model = new GoalModel(serverDB, userId);
      const current = await model.findById(graph.goal.id);
      await serverDB
        .update(goals)
        .set({
          config: {
            ...current?.config,
            planningCheckpoint: {
              token: current!.config!.planningCheckpoint!.token,
              expiresAt: '2000-01-01T00:00:00.000Z',
            },
          },
        })
        .where(eq(goals.id, graph.goal.id));
      await new GoalService(serverDB, userId).tick(graph.goal.id);
    } finally {
      release();
      await first;
    }
    const after = await service.graph(graph.goal.id);
    expect(after.nodes.filter((node) => node.kind === 'task').map((node) => node.title)).toEqual([
      'New task',
    ]);
    expect(after.goal.config?.planningCheckpoint).toBeUndefined();
  });

  it.each(['paused', 'changed'] as const)(
    'discards planning when the goal is %s during generation',
    async (change) => {
      const service = new GoalService(serverDB, userId);
      const graph = await service.create({ title: 'Original goal' });
      vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose').mockImplementation(
        async () => {
          await new GoalModel(serverDB, userId).update(
            graph.goal.id,
            change === 'paused' ? { status: 'paused' } : { requirement: 'New requirement' },
          );
          return {
            problemStatement: 'Old plan',
            tasks: [{ instruction: 'Old', title: 'Old task' }],
          };
        },
      );
      await service.tick(graph.goal.id);
      const after = await service.graph(graph.goal.id);
      expect(after.nodes.filter((node) => node.kind === 'task')).toHaveLength(0);
      expect(after.goal.config?.planningCheckpoint).toBeUndefined();
    },
  );

  it('rolls back an incomplete decomposition and allows a clean retry', async () => {
    vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose').mockResolvedValue({
      problemStatement: 'Planned question',
      tasks: [
        { instruction: 'Collect sources', title: 'Research' },
        { dependsOn: [0], instruction: 'Write report', title: 'Report' },
      ],
    });
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      problemDescription: 'Original question',
      title: 'Atomic planning',
    });
    // Fail only when the planner reaches dependency insertion, after all nodes
    // and their ownership edges have been written.
    await serverDB.execute(
      sql`ALTER TABLE goal_edges ADD CONSTRAINT fail_planning_dependency CHECK (kind <> 'depends_on')`,
    );
    try {
      await expect(service.tick(graph.goal.id)).rejects.toThrow();
    } finally {
      await serverDB.execute(sql`ALTER TABLE goal_edges DROP CONSTRAINT fail_planning_dependency`);
    }
    const after = await service.graph(graph.goal.id);
    expect(after.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(after.nodes[0].description).toBe('Original question');
    expect(after.edges).toHaveLength(0);
    expect(
      after.events.filter((event) => event.entityType === 'node' && event.eventType === 'created'),
    ).toHaveLength(1);

    await service.tick(graph.goal.id);
    const retried = await service.graph(graph.goal.id);
    expect(retried.nodes.filter((node) => node.kind === 'task')).toHaveLength(2);
    expect(retried.edges.filter((edge) => edge.kind === 'depends_on')).toHaveLength(1);
  });

  it('falls back to a single Task when the planner fails, instead of stalling', async () => {
    vi.spyOn(GoalDecompositionPlannerService.prototype, 'decompose').mockRejectedValue(
      new Error('model unavailable'),
    );
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ problemDescription: '原话', title: 'Nothing to do' });

    const result = await service.tick(graph.goal.id);

    expect(result.outcome).toBe('advanced');
    const tasks = (await service.graph(graph.goal.id)).nodes.filter((n) => n.kind === 'task');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe('原话');
  });

  it('parks a goal nothing can move so the sweep stops re-picking it', async () => {
    // Every remaining Task is blocked and nothing runs to unblock it. Left
    // `running` it is selected by every newest-first scan forever, and enough
    // of them starve every other stalled goal out of the sweep's window.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['A', 'B'], title: 'Deadlocked' });
    const [a, b] = graph.nodes.filter((n) => n.kind === 'task');
    const graphModel = new GoalGraphModel(serverDB, userId);
    await graphModel.createEdge(graph.goal.id, a.id, b.id, 'depends_on');
    await graphModel.createEdge(graph.goal.id, b.id, a.id, 'depends_on');

    const result = await service.tick(graph.goal.id);

    expect(result.outcome).toBe('no_progress');
    expect((await service.graph(graph.goal.id)).goal.status).toBe('paused');
    expect(
      await GoalModel.listStalled(serverDB, { staleBefore: new Date(Date.now() - 60_000) }),
    ).not.toContainEqual(expect.objectContaining({ id: graph.goal.id }));
  });

  it('leaves goal-level status transitions on the event trail', async () => {
    // The coordinator parks and reopens goals constantly, but only node
    // transitions used to be recorded — `entity_type='goal'` events existed in
    // the schema with no writer, so the lifecycle timeline was unreconstructable.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['A', 'B'], title: 'Lifecycle trail' });
    const [a, b] = graph.nodes.filter((n) => n.kind === 'task');
    const graphModel = new GoalGraphModel(serverDB, userId);
    await graphModel.createEdge(graph.goal.id, a.id, b.id, 'depends_on');
    await graphModel.createEdge(graph.goal.id, b.id, a.id, 'depends_on');

    await service.tick(graph.goal.id); // deadlock → no_frontier → paused
    await service.resume(graph.goal.id); // paused → running

    const lifecycle = (await service.graph(graph.goal.id)).events.filter(
      (event) => event.entityType === 'goal',
    );

    // Same-millisecond events read back in either order; assert on content.
    expect(lifecycle).toHaveLength(2);
    expect(lifecycle).toContainEqual(
      expect.objectContaining({
        actorType: 'system',
        eventType: 'updated',
        reason: 'no eligible task to advance',
      }),
    );
    expect(lifecycle).toContainEqual(
      expect.objectContaining({ eventType: 'activated', reason: 'resumed by user' }),
    );
  });

  it('reopens a goal its deadline stopped when the deadline moves out', async () => {
    // A calendar deadline is the long-horizon budget unit; extending it has to
    // unstick the goal exactly like raising a round budget does. Two ticks:
    // creating the responsible task costs nothing, the deadline gates the run.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      config: { schedule: { deadline: new Date(Date.now() - 1000).toISOString() } },
      title: 'Overdue',
      tasks: ['Too late to start'],
    });

    await service.tick(graph.goal.id); // creates the responsible task
    const stopped = await service.tick(graph.goal.id);
    expect(stopped.message).toContain('Deadline passed');
    expect((await service.graph(graph.goal.id)).goal.status).toBe('paused');

    const extended = await service.setBudget(graph.goal.id, {
      deadline: new Date(Date.now() + 3_600_000).toISOString(),
    });

    expect(extended?.status).not.toBe('paused');
    expect(extended?.config?.schedule?.deadline).toBeTruthy();
  });

  it('dispatches a Task when the goal has no deadline', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Just task'], title: 'No deadline' });

    const result = await service.tick(graph.goal.id);

    expect(result.outcome).toBe('advanced');
  });

  it('files a goal the agent created under that agent, not its owner', async () => {
    // `/goal` is an agent making the call. `agentId` alone cannot say so — the
    // creation modal sets it too, and there the author is the person.
    await serverDB.insert(agents).values({
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
      id: 'agt_goal_author',
      slug: 'agt-goal-author',
      userId,
    });
    const service = new GoalService(serverDB, userId);

    const graph = await service.create({
      agentId: 'agt_goal_author',
      createdByAgentId: 'agt_goal_author',
      title: 'Agent-authored goal',
      tasks: ['Do the thing'],
    });

    const seeded = graph.events.filter((event) => ['created', 'linked'].includes(event.eventType));
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((event) => event.actorType === 'agent')).toBe(true);
    expect(seeded.every((event) => event.actorId === 'agt_goal_author')).toBe(true);
    expect(graph.nodes.every((node) => node.createdByAgentId === 'agt_goal_author')).toBe(true);
  });

  it('still files a goal the user created under the user, even on an agent page', async () => {
    // The modal passes `agentId` for assignment; the author is the person.
    await serverDB.insert(agents).values({
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
      id: 'agt_assignee',
      slug: 'agt-assignee',
      userId,
    });
    const service = new GoalService(serverDB, userId);

    const graph = await service.create({
      agentId: 'agt_assignee',
      title: 'User-authored goal',
      tasks: ['Do the thing'],
    });

    const seeded = graph.events.filter((event) => ['created', 'linked'].includes(event.eventType));
    expect(seeded.every((event) => event.actorType === 'user')).toBe(true);
    expect(seeded.every((event) => event.actorId === userId)).toBe(true);
  });

  it('separates what the coordinator decided from what the user asked for', async () => {
    // The audit trail recorded every transition as the goal's owner, so "what did
    // the system decide on its own" could not be answered from product data.
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ tasks: ['Do the thing'], title: 'Attributed goal' });

    // Seeding is the user's ask; claiming the Task and binding its runner is not.
    await service.tick(graph.goal.id);

    const { events, nodes } = await service.graph(graph.goal.id);
    const task = nodes.find((node) => node.kind === 'task')!;
    const actorsFor = (eventType: string, entityId: string) =>
      events
        .filter((event) => event.eventType === eventType && event.entityId === entityId)
        .map((event) => ({ actorId: event.actorId, actorType: event.actorType }));

    expect(actorsFor('created', task.id)).toEqual([{ actorId: userId, actorType: 'user' }]);
    expect(actorsFor('activated', task.id)).toEqual([
      { actorId: GOAL_COORDINATOR_ACTOR_ID, actorType: 'system' },
    ]);
    expect(events.some((event) => event.actorType === 'system')).toBe(true);
  });

  it('puts complete criteria in the editable Issue body without engine records', async () => {
    const service = new GoalService(serverDB, userId);
    const agentId = 'goal-work-verifier-agent';
    await serverDB.insert(agents).values({
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' } },
      id: agentId,
      title: 'Goal worker',
      userId,
    });
    const graph = await service.create({
      agentId,
      requirement: 'Generate data, then train and evaluate a model.',
      title: 'Two-stage experiment',
      tasks: ['Generate isolated data'],
    });

    const created = await service.tick(graph.goal.id);
    const taskModel = new TaskModel(serverDB, userId);
    const task = await taskModel.findById(created.taskId!);
    expect(taskModel.shouldPauseOnTopicComplete(task!)).toBe(false);
    expect(task?.config).not.toHaveProperty('verify');
    expect(task?.description).toBe('Generate isolated data');
    expect(task?.instruction).toContain('Verify only this Task: Generate isolated data.');
    expect(task?.instruction).toContain('their reviewer Agents judge them separately');
  });

  it('parks a goal short of acceptance and reopens it when the measurement clears', async () => {
    // The measured half of acceptance: "followers >= 1000" is not a document a
    // verifier reads, it is a number. Until it holds, the acceptance Task must
    // not be created — and the goal must not sit `running` reporting
    // `no_progress`, or every sweep would re-tick it for the whole wait.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const goalModel = new GoalModel(serverDB, userId);
    const graph = await service.create({
      config: { acceptance: { metrics: [{ key: 'followers', target: 1000 }] } },
      requirement: 'Grow the account',
      tasks: ['Publish the first posts'],
      title: 'Measured goal',
    });
    const created = await service.tick(graph.goal.id);
    await taskModel.updateStatus(created.taskId!, 'completed');
    await service.tick(graph.goal.id);

    // Nothing measured yet — "never observed" is not "satisfied".
    const unmeasured = await service.tick(graph.goal.id);
    expect(unmeasured).toMatchObject({ outcome: 'no_progress' });
    expect(unmeasured.message).toContain('no observation');
    expect((await goalModel.findById(graph.goal.id))?.status).toBe('paused');
    expect(
      (await service.graph(graph.goal.id)).nodes.some(
        (n) => n.title === 'Complete full Goal acceptance',
      ),
    ).toBe(false);

    // A sample that is still short leaves it parked and is not worth an advance.
    const short = await service.recordObservation(graph.goal.id, {
      key: 'followers',
      value: 400,
    });
    expect(short.shouldAdvance).toBe(false);
    expect((await goalModel.findById(graph.goal.id))?.status).toBe('paused');

    // The number lands: the goal reopens and falls through to its delivery
    // contract.
    const cleared = await service.recordObservation(graph.goal.id, {
      key: 'followers',
      value: 1200,
    });
    expect(cleared.shouldAdvance).toBe(true);
    expect((await goalModel.findById(graph.goal.id))?.status).toBe('running');

    const advanced = await service.tick(graph.goal.id);
    expect(advanced).toMatchObject({ outcome: 'achieved' });
    expect(
      (await service.graph(graph.goal.id)).nodes.some(
        (n) => n.title === 'Complete full Goal acceptance',
      ),
    ).toBe(false);
  });

  /** A goal parked by the gate, one clause short of acceptance. */
  const parkedOnGate = async (service: GoalService) => {
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({
      config: { acceptance: { metrics: [{ key: 'followers', target: 1000 }] } },
      requirement: 'Grow the account',
      tasks: ['Publish the first posts'],
      title: 'Parked on a measurement',
    });
    const created = await service.tick(graph.goal.id);
    await taskModel.updateStatus(created.taskId!, 'completed');
    await service.tick(graph.goal.id);
    await service.tick(graph.goal.id);
    return graph.goal.id;
  };

  it('reopens a goal parked before the pause marker existed', async () => {
    // Rows parked by the parent implementation — and any parked by an old
    // worker mid-deploy — carry no marker. Requiring one strictly would strand
    // them until somebody pressed Resume by hand, so the transition's recorded
    // actor stands in for it.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const goalModel = new GoalModel(serverDB, userId);
    const goalId = await parkedOnGate(service);

    // Exactly what a pre-marker row looks like.
    const parked = (await goalModel.findById(goalId))!;
    await goalModel.update(goalId, { config: { ...parked.config, pausedBy: undefined } });

    const cleared = await service.recordObservation(goalId, { key: 'followers', value: 5000 });

    expect(cleared.shouldAdvance).toBe(true);
    expect((await goalModel.findById(goalId))?.status).toBe('running');
  });

  it('does not let an observation restart a goal the coordinator parked for another reason', async () => {
    // The coordinator also parks goals that are deadlocked or out of budget.
    // Those carry no marker either once they predate it, so the fallback has to
    // read *why* it parked — not just that it was the coordinator.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const goalModel = new GoalModel(serverDB, userId);
    const graph = await service.create({
      config: { acceptance: { metrics: [{ key: 'followers', target: 1000 }] } },
      requirement: 'Deadlocked before the gate',
      tasks: ['A', 'B'],
      title: 'Parked with work outstanding',
    });
    const [a, b] = graph.nodes.filter((n) => n.kind === 'task');
    const graphModel = new GoalGraphModel(serverDB, userId);
    await graphModel.createEdge(graph.goal.id, a.id, b.id, 'depends_on');
    await graphModel.createEdge(graph.goal.id, b.id, a.id, 'depends_on');

    await service.tick(graph.goal.id); // deadlock → no_frontier → paused
    expect((await goalModel.findById(graph.goal.id))?.status).toBe('paused');

    const satisfying = await service.recordObservation(graph.goal.id, {
      key: 'followers',
      value: 5000,
    });

    expect(satisfying.shouldAdvance).toBe(false);
    expect((await goalModel.findById(graph.goal.id))?.status).toBe('paused');
  });

  it('leaves a deliberately paused goal alone even when the measurement lands', async () => {
    // The hard case: same status, same terminal phase, same clauses as a goal
    // the coordinator parked. Only the recorded pause reason tells them apart,
    // and without it a satisfying sample would restart a goal somebody stopped
    // on purpose — and run its acceptance work.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const goalModel = new GoalModel(serverDB, userId);
    const goalId = await parkedOnGate(service);
    await service.pause(goalId);

    const satisfying = await service.recordObservation(goalId, { key: 'followers', value: 5000 });

    expect(satisfying.shouldAdvance).toBe(false);
    expect((await goalModel.findById(goalId))?.status).toBe('paused');
    expect(
      (await service.graph(goalId)).nodes.some((n) => n.title === 'Complete full Goal acceptance'),
    ).toBe(false);
  });

  it('resumes a user-paused goal only through resume, and then it advances again', async () => {
    // The other half: once the person lifts their own pause, the goal is the
    // coordinator's again.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const goalId = await parkedOnGate(service);
    await service.pause(goalId);
    await service.recordObservation(goalId, { key: 'followers', value: 5000 });

    await service.resume(goalId);

    expect(await service.tick(goalId)).toMatchObject({ outcome: 'achieved' });
  });

  it('unblocks a parked goal when its last clause is dropped', async () => {
    // `setMetricCriteria(id, [])` is the advertised way to clear the gate. It
    // used to leave the goal parked on a gate that no longer existed, so the
    // scheduled advance ticked straight back out as `goal_paused` and only a
    // manual resume could move it.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const goalModel = new GoalModel(serverDB, userId);
    const goalId = await parkedOnGate(service);
    expect((await goalModel.findById(goalId))?.status).toBe('paused');

    await service.setMetricCriteria(goalId, []);

    expect((await goalModel.findById(goalId))?.status).toBe('running');
    expect(await service.tick(goalId)).toMatchObject({ outcome: 'achieved' });
  });

  it('unblocks a parked goal when a clause is relaxed below the measurement', async () => {
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const goalModel = new GoalModel(serverDB, userId);
    const goalId = await parkedOnGate(service);
    await service.recordObservation(goalId, { key: 'followers', value: 400 });
    expect((await goalModel.findById(goalId))?.status).toBe('paused');

    await service.setMetricCriteria(goalId, [{ key: 'followers', target: 100 }]);

    expect((await goalModel.findById(goalId))?.status).toBe('running');
  });

  it('merges a declared clause into the server-side list instead of replacing it', async () => {
    // Two editors declaring from the same stale snapshot must not erase each
    // other: merge upserts by key against the list as it stands on the server.
    const service = new GoalService(serverDB, userId);
    const goalModel = new GoalModel(serverDB, userId);
    const graph = await service.create({
      config: { acceptance: { metrics: [{ key: 'followers', target: 1000 }] } },
      requirement: 'Grow the account',
      tasks: ['Publish'],
      title: 'Merge-mode goal',
    });

    // A "concurrent" declaration this client never saw.
    await service.setMetricCriteria(
      graph.goal.id,
      [{ key: 'retention', op: 'gte', target: 80 }],
      'merge',
    );
    // This client merges its own clause from a snapshot that predates it.
    await service.setMetricCriteria(
      graph.goal.id,
      [{ key: 'followers', target: 2000, title: '粉丝' }],
      'merge',
    );

    const metrics = (await goalModel.findById(graph.goal.id))?.config?.acceptance?.metrics;
    expect(metrics).toHaveLength(2);
    expect(metrics).toContainEqual({ key: 'retention', op: 'gte', target: 80 });
    // Same-key merge upserts rather than duplicating.
    expect(metrics).toContainEqual({ key: 'followers', target: 2000, title: '粉丝' });
  });

  it('records what the measured decision read, not just its verdict', async () => {
    // A replay has to see the number the live run saw — the same reason the
    // deadline verdict travels with the budget.
    vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const metricModel = new MetricModel(serverDB, userId);
    const graph = await service.create({
      config: { acceptance: { metrics: [{ key: 'churn', op: 'lte', target: 5 }] } },
      requirement: 'Keep churn down',
      tasks: ['Ship retention fixes'],
      title: 'Traced measurement',
    });
    const created = await service.tick(graph.goal.id);
    await taskModel.updateStatus(created.taskId!, 'completed');
    await service.tick(graph.goal.id);

    const series = (await metricModel.ensure({
      key: 'churn',
      subjectId: graph.goal.id,
      subjectType: 'goal',
    }))!;
    await metricModel.addPoint(series.id, {
      actorType: 'system',
      observedAt: new Date('2026-09-01T00:00:00Z'),
      sourceType: 'probe',
      value: 9,
    });

    const observed: GoalTickObservation[] = [];
    await service.tick(graph.goal.id, { onDecision: (o) => observed.push(o) });

    expect(observed.at(-1)!.metricCriteria).toMatchObject({
      allMet: false,
      criteria: [{ key: 'churn', met: false, op: 'lte', target: 5, value: 9 }],
    });
  });

  it('evolves a failed task into a durable decision gate', async () => {
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({ tasks: ['Risky task'], title: 'Failure recovery' });
    const created = await service.tick(graph.goal.id);

    await taskModel.updateStatus(created.taskId!, 'paused', { error: 'Verifier rejected output' });
    const waiting = await service.tick(graph.goal.id);
    expect(waiting.outcome).toBe('waiting_human');

    const gated = await service.graph(graph.goal.id);
    const decision = gated.decisions[0];
    expect(decision).toMatchObject({ recommendedOptionId: 'retry', status: 'pending' });
    expect(gated.nodes.some((node) => node.kind === 'decision')).toBe(true);

    await service.decide(graph.goal.id, decision.id, 'retire', 'This branch is not useful');
    const achieved = await service.tick(graph.goal.id);
    expect(achieved.outcome).toBe('achieved');
  });

  it('reports the effects a tick actually produced, not just its outcome', async () => {
    // The rollup counts gates and findings from these effects, so a branch that
    // forgets to report one reads as "no human was ever involved" — silently,
    // and only in the trace. Driving the real path is the only thing that
    // catches it; a synthetic observation always agrees with itself.
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({ tasks: ['Risky task'], title: 'Effect reporting' });

    const created = await service.tick(graph.goal.id);
    await taskModel.updateStatus(created.taskId!, 'paused', { error: 'Verifier rejected output' });

    const observed: GoalTickObservation[] = [];
    const gated = await service.tick(graph.goal.id, {
      onDecision: (observation) => observed.push(observation),
    });

    expect(gated.outcome).toBe('waiting_human');
    expect(observed.at(-1)!.effects).toContainEqual(
      expect.objectContaining({ detail: 'Verifier rejected output', type: 'opened_decision' }),
    );

    // And the other half: a completed task folds into a finding, which is what
    // `findingsTotal` counts.
    const decision = (await service.graph(graph.goal.id)).decisions[0];
    await service.decide(graph.goal.id, decision.id, 'retry');
    await taskModel.updateStatus(created.taskId!, 'completed');

    const consumed: GoalTickObservation[] = [];
    await service.tick(graph.goal.id, { onDecision: (o) => consumed.push(o) });

    expect(consumed.at(-1)!.effects).toContainEqual(
      expect.objectContaining({ detail: 'finding', type: 'created_node' }),
    );
  });

  it('refuses to start a task once the goal is at its concurrency limit', async () => {
    // The planner's cap check is a fast path over a snapshot; two overlapping
    // advances can both read it below the limit. The count and the claim are
    // therefore taken together under a per-goal lock, and this is the assertion
    // that the enforcement — not the fast path — is what holds.
    const runSpy = vi
      .spyOn(TaskRunnerService.prototype, 'runTask')
      .mockResolvedValue({ operationId: 'op-cap', taskId: 'placeholder' } as never);

    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      config: { maxConcurrentTasks: 1 },
      title: 'Capped goal',
      tasks: ['First', 'Second'],
    });

    // Fill the single slot — the tick's claim mints the dispatch row itself.
    await service.tick(graph.goal.id);
    await service.tick(graph.goal.id);
    runSpy.mockClear();

    // The second task exists and is unblocked, but there is no room for it.
    const capped = await service.tick(graph.goal.id);

    expect(capped.outcome).toBe('waiting_external');
    expect(runSpy).not.toHaveBeenCalled();
  });

  it('reclaims a stale running Task operation and starts the next attempt', async () => {
    const runSpy = vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({
      agentId: 'agent-recovery',
      assistantMessageId: 'message-assistant',
      autoStarted: true,
      createdAt: new Date().toISOString(),
      message: 'started',
      operationId: 'op-recovery',
      status: 'running',
      success: true,
      taskId: 'placeholder',
      taskIdentifier: 'T-recovery',
      timestamp: new Date().toISOString(),
      topicId: 'topic-recovery',
      userMessageId: 'message-user',
    });
    vi.spyOn(TaskTopicModel.prototype, 'findRunningByTaskIds').mockResolvedValue([
      { operationId: 'op-stale', topicId: 'topic-stale' } as never,
    ]);
    const timeoutSpy = vi
      .spyOn(TaskTopicModel.prototype, 'updateStatus')
      .mockResolvedValue(undefined);
    const settleSpy = vi
      .spyOn(AgentOperationModel.prototype, 'settleStaleRunning')
      .mockResolvedValue(true);

    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({
      config: {
        recovery: { maxAttemptsPerTask: 3, operationLeaseTimeoutMs: 60_000 },
      },
      title: 'Recover interrupted work',
      tasks: ['Run a durable experiment'],
    });
    const created = await service.tick(graph.goal.id);
    await taskModel.update(created.taskId!, { totalTopics: 1 });
    await dispatchFixture(created.taskId!, 'running');

    const recovered = await service.tick(graph.goal.id);

    expect(settleSpy).toHaveBeenCalledWith('op-stale', expect.any(Date), undefined);
    expect(timeoutSpy).toHaveBeenCalledWith(created.taskId, 'topic-stale', 'timeout');
    expect(runSpy).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
      maxSteps: undefined,
      taskId: created.taskId,
      trigger: 'goal',
    });
    expect(recovered).toMatchObject({
      message: expect.stringContaining('Recovered abandoned task'),
      outcome: 'waiting_external',
      taskId: created.taskId,
    });
  });

  it('charges stale Task usage before checking the replacement budget', async () => {
    const runSpy = vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({} as never);
    vi.spyOn(TaskTopicModel.prototype, 'findRunningByTaskIds').mockResolvedValue([
      { operationId: 'op-stale-cost', topicId: 'topic-stale-cost' } as never,
    ]);
    vi.spyOn(TaskTopicModel.prototype, 'updateStatus').mockResolvedValue(undefined);
    vi.spyOn(InMemoryAgentStateManager.prototype, 'getOperationMetadata').mockResolvedValue({
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      status: 'running',
      totalCost: 0.75,
      totalSteps: 2,
    });

    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({
      config: { recovery: { maxAttemptsPerTask: 3, operationLeaseTimeoutMs: 60_000 } },
      maxTotalCost: 0.5,
      title: 'Respect abandoned Work cost',
      tasks: ['Run an expensive experiment'],
    });
    const created = await service.tick(graph.goal.id);
    await taskModel.update(created.taskId!, { totalTopics: 1 });
    await dispatchFixture(created.taskId!, 'running');
    await new AgentOperationModel(serverDB, userId).recordStart({
      operationId: 'op-stale-cost',
      taskId: created.taskId,
    });
    await serverDB
      .update(agentOperations)
      .set({ updatedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(agentOperations.id, 'op-stale-cost'));

    const recovered = await service.tick(graph.goal.id);

    expect(runSpy).not.toHaveBeenCalled();
    expect(recovered).toMatchObject({ outcome: 'waiting_human', taskId: created.taskId });
    expect(await new AgentOperationModel(serverDB, userId).findById('op-stale-cost')).toMatchObject(
      {
        status: 'abandoned',
        totalCost: 0.75,
      },
    );
  });

  it('does not reclaim a running Task operation without a persisted topic id', async () => {
    vi.spyOn(TaskTopicModel.prototype, 'findRunningByTaskIds').mockResolvedValue([
      { operationId: 'op-without-topic', topicId: null } as never,
    ]);
    const settleSpy = vi.spyOn(AgentOperationModel.prototype, 'settleStaleRunning');

    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      config: { recovery: { operationLeaseTimeoutMs: 60_000 } },
      title: 'Wait for topic persistence',
      tasks: ['Run a durable experiment'],
    });
    const created = await service.tick(graph.goal.id);
    await dispatchFixture(created.taskId!, 'running');

    const waiting = await service.tick(graph.goal.id);

    expect(settleSpy).not.toHaveBeenCalled();
    expect(waiting).toMatchObject({
      message: expect.stringContaining('is running'),
      outcome: 'waiting_external',
      taskId: created.taskId,
    });
  });

  it('starts a ready sibling Task even when a running Task row is older than the operation lease', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      config: { recovery: { operationLeaseTimeoutMs: 60_000 } },
      title: 'Keep parallel work moving',
      tasks: ['Long-running experiment', 'Independent analysis'],
    });
    const running = await service.tick(graph.goal.id);
    await dispatchFixture(running.taskId!, 'running');
    await serverDB
      .update(tasks)
      .set({ updatedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(tasks.id, running.taskId!));

    const sibling = await service.tick(graph.goal.id);

    expect(sibling).toMatchObject({ outcome: 'advanced' });
    expect(sibling.taskId).not.toBe(running.taskId);
  });

  it('rolls back the operation reclaim when recovery bookkeeping fails', async () => {
    vi.spyOn(TaskTopicModel.prototype, 'findRunningByTaskIds').mockResolvedValue([
      { operationId: 'op-atomic-recovery', topicId: 'topic-stale' } as never,
    ]);
    vi.spyOn(TaskTopicModel.prototype, 'updateStatus').mockRejectedValueOnce(
      new Error('topic update failed'),
    );

    const service = new GoalService(serverDB, userId);
    const operationModel = new AgentOperationModel(serverDB, userId);
    const graph = await service.create({
      config: { recovery: { operationLeaseTimeoutMs: 60_000 } },
      title: 'Atomic abandoned recovery',
      tasks: ['Run a durable experiment'],
    });
    const created = await service.tick(graph.goal.id);
    await dispatchFixture(created.taskId!, 'running');
    await operationModel.recordStart({ operationId: 'op-atomic-recovery' });
    await serverDB
      .update(agentOperations)
      .set({ updatedAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(agentOperations.id, 'op-atomic-recovery'));

    await expect(service.tick(graph.goal.id)).rejects.toThrow('topic update failed');

    expect((await operationModel.findById('op-atomic-recovery'))?.status).toBe('running');
    expect(await derivedStatus(created.taskId!)).toBe('running');
  });

  it('resumes automatic recovery after the atomic bookkeeping transaction committed', async () => {
    const runSpy = vi.spyOn(TaskRunnerService.prototype, 'runTask').mockResolvedValue({
      agentId: 'agent-recovery',
      assistantMessageId: 'message-assistant',
      autoStarted: true,
      createdAt: new Date().toISOString(),
      message: 'started',
      operationId: 'op-recovery-next',
      status: 'running',
      success: true,
      taskId: 'placeholder',
      taskIdentifier: 'T-recovery',
      timestamp: new Date().toISOString(),
      topicId: 'topic-recovery-next',
      userMessageId: 'message-user',
    });
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({
      config: { recovery: { maxAttemptsPerTask: 3 } },
      title: 'Resume abandoned recovery',
      tasks: ['Run a durable experiment'],
    });
    const created = await service.tick(graph.goal.id);
    await taskModel.update(created.taskId!, { totalTopics: 1 });
    await taskModel.updateStatus(created.taskId!, 'paused', {
      error: 'Goal Task operation lease expired.',
    });

    const recovered = await service.tick(graph.goal.id);

    expect(runSpy).toHaveBeenCalledOnce();
    expect(recovered).toMatchObject({
      message: expect.stringContaining('Recovered abandoned task'),
      outcome: 'waiting_external',
    });
  });

  it('respects a manually paused responsible task without rerunning it', async () => {
    const service = new GoalService(serverDB, userId);
    const taskModel = new TaskModel(serverDB, userId);
    const graph = await service.create({ tasks: ['Wait for review'], title: 'Paused task' });
    const created = await service.tick(graph.goal.id);

    await taskModel.updateStatus(created.taskId!, 'paused', { error: null });
    const waiting = await service.tick(graph.goal.id);

    expect(waiting).toMatchObject({
      outcome: 'waiting_human',
      taskId: created.taskId,
    });
    expect((await service.graph(graph.goal.id)).decisions).toHaveLength(0);
  });

  it('only selects Tasks whose explicit dependencies are resolved', async () => {
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({ title: 'Dependency-aware goal' });
    const prerequisite = await service.addNode(graph.goal.id, {
      kind: 'task',
      priority: 0,
      title: 'Collect evidence',
    });
    const dependent = await service.addNode(graph.goal.id, {
      kind: 'task',
      priority: 10,
      title: 'Train from evidence',
    });
    await service.addEdge(graph.goal.id, dependent.id, prerequisite.id, 'depends_on');

    const first = await service.tick(graph.goal.id);
    expect(first).toMatchObject({ nodeId: prerequisite.id, outcome: 'advanced' });

    const taskModel = new TaskModel(serverDB, userId);
    await taskModel.updateStatus(first.taskId!, 'completed');
    await service.tick(graph.goal.id);

    const next = await service.tick(graph.goal.id);
    expect(next).toMatchObject({ nodeId: dependent.id, outcome: 'advanced' });
  });
});

describe('dispatch readiness recheck', () => {
  it('re-derives depends_on readiness under the dispatch lock when a plan patch lands mid-tick', async () => {
    // The frontier ranks from a snapshot; a CAID `patch` (or a resolved
    // decision) can commit a depends_on edge between that read and the locked
    // claim. The claim must honor the current receipt, not the stale one —
    // otherwise the new dependency is silently bypassed.
    const runSpy = vi
      .spyOn(TaskRunnerService.prototype, 'runTask')
      .mockImplementation(async ({ taskId }) => ({ taskId }) as never);
    const service = new GoalService(serverDB, userId);
    const graph = await service.create({
      tasks: ['Ship the report'],
      title: 'Patch-raced dispatch',
    });
    const nodeId = graph.nodes.find((node) => node.kind === 'task')!.id;
    const created = await service.tick(graph.goal.id);

    // The late depends_on edge is injected only on the claim-time re-read
    // (the advisory-lock transaction handle), exactly where a CAID patch
    // would have committed between the tick's snapshot and the claim.
    graphEdgeInjection.current = {
      baseDb: serverDB,
      edge: {
        createdAt: new Date(),
        goalId: graph.goal.id,
        id: 'edge-late-patch',
        kind: 'depends_on',
        sourceNodeId: nodeId,
        targetNodeId: 'node-missing-prerequisite',
      },
    };
    try {
      const blocked = await service.tick(graph.goal.id);

      expect(blocked).toMatchObject({ nodeId, outcome: 'waiting_external' });
      expect(blocked.message).toContain('blocked');
      expect(runSpy).not.toHaveBeenCalled();
      expect(await derivedStatus(created.taskId!)).toBe('backlog');
    } finally {
      graphEdgeInjection.current = null;
    }
  });
});
