// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { withTestAgentDevices } from '../../core/testAgentFixture';
import {
  agents,
  orchestrationWorkflowEdges,
  orchestrationWorkflowNodeDecisions,
  orchestrationWorkflowNodes,
  orchestrationWorkflows,
  taskTopics,
  topics,
  users,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { OrchestrationWorkflowModel } from '../orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '../orchestrationWorkflowGraph';
import { TaskModel } from '../task';

const serverDB: OrviloDatabase = await getTestDB();

const userId = 'orchestration-workflow-model-test-user-id';
const otherUserId = 'orchestration-workflow-model-test-user-2';
const orchestrationWorkflowModel = new OrchestrationWorkflowModel(serverDB, userId);
const graphModel = new OrchestrationWorkflowGraphModel(serverDB, userId);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
});

afterEach(async () => {
  await serverDB.delete(users).where(eq(users.id, userId));
});

describe('OrchestrationWorkflowModel', () => {
  it('releases only the verifier system pause after repair, preserving user pauses and other config', async () => {
    const definition = await orchestrationWorkflowModel.create({
      title: 'Verifier paused',
      status: 'paused',
      config: { pausedBy: 'verification_unavailable', recovery: { maxAttemptsPerTask: 2 } },
    });
    expect(await orchestrationWorkflowModel.reopenAfterVerifierRepair(definition.id)).toBe(true);
    expect((await orchestrationWorkflowModel.findById(definition.id))?.config).toEqual({
      recovery: { maxAttemptsPerTask: 2 },
    });
    await orchestrationWorkflowModel.updateStatus(definition.id, 'paused');
    await orchestrationWorkflowModel.updatePauseReason(definition.id, 'user');
    expect(await orchestrationWorkflowModel.reopenAfterVerifierRepair(definition.id)).toBe(false);
    expect((await orchestrationWorkflowModel.findById(definition.id))?.status).toBe('paused');
  });

  describe('supervisor state', () => {
    it('claims an incident once and preserves other configuration under concurrent writes', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        config: { supervision: { enabled: true }, recovery: { maxAttemptsPerTask: 4 } },
        title: 'Supervised',
      });
      const state = { agentId: 'agent', incidents: [], topicId: 'topic' };
      const claims = await Promise.all([
        orchestrationWorkflowModel.updateSupervisorState(orchestrationWorkflow.id, 0, state),
        orchestrationWorkflowModel.updateSupervisorState(orchestrationWorkflow.id, 0, state),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      await orchestrationWorkflowModel.updatePauseReason(orchestrationWorkflow.id, 'user');
      await orchestrationWorkflowModel.updateSupervisorState(orchestrationWorkflow.id, 1, state);
      expect(
        (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config,
      ).toMatchObject({
        pausedBy: 'user',
        recovery: { maxAttemptsPerTask: 4 },
        supervisorState: { revision: 2 },
      });
      expect(
        await orchestrationWorkflowModel.updateSupervisorState(orchestrationWorkflow.id, 1, state),
      ).toBeUndefined();
      await orchestrationWorkflowModel.update(orchestrationWorkflow.id, {
        config: { supervision: { enabled: false } },
      });
      expect(
        (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config
          ?.supervisorState?.revision,
      ).toBe(2);
    });

    it('cannot read-lock or mutate another user supervisor state', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        title: 'Private supervision',
      });
      const other = new OrchestrationWorkflowModel(serverDB, otherUserId);
      expect(await other.lockById(orchestrationWorkflow.id)).toBeUndefined();
      expect(
        await other.updateSupervisorState(orchestrationWorkflow.id, 0, {
          agentId: 'agent',
          incidents: [],
          topicId: 'topic',
        }),
      ).toBeUndefined();
      expect(
        (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config
          ?.supervisorState,
      ).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates an orchestration workflow with defaults', async () => {
      const result = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Ship the orchestration workflows table',
      });

      expect(result.id).toMatch(/^orchestrationWorkflow_/);
      expect(result).toMatchObject({
        status: 'planning',
        subjectType: 'standalone',
        title: 'Ship the orchestration workflows table',
        userId,
      });
    });

    it('persists budget and requirement', async () => {
      const result = await orchestrationWorkflowModel.create({
        maxRounds: 5,
        maxTotalCost: 12.5,
        requirement: 'All tests pass',
        subjectType: 'standalone',
        title: 'Budgeted orchestration workflow',
      });

      expect(result.maxRounds).toBe(5);
      expect(result.maxTotalCost).toBe(12.5);
      expect(result.requirement).toBe('All tests pass');
    });
  });

  describe('updatePauseReason', () => {
    it('patches only the marker, leaving a concurrent config edit intact', async () => {
      // The coordinator writes this from a tick while the user edits budget and
      // acceptance criteria on the same JSONB column from the orchestration workflow page. A
      // read-modify-write of the whole config would let whichever landed second
      // discard the other's work.
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        config: { acceptance: { metrics: [{ key: 'followers', target: 1000 }] } },
        subjectType: 'standalone',
        title: 'Concurrent config writers',
      });

      await orchestrationWorkflowModel.updatePauseReason(
        orchestrationWorkflow.id,
        'measured_acceptance',
      );

      const parked = await orchestrationWorkflowModel.findById(orchestrationWorkflow.id);
      expect(parked?.config).toMatchObject({
        acceptance: { metrics: [{ key: 'followers', target: 1000 }] },
        pausedBy: 'measured_acceptance',
      });

      await orchestrationWorkflowModel.updatePauseReason(orchestrationWorkflow.id, undefined);

      const cleared = await orchestrationWorkflowModel.findById(orchestrationWorkflow.id);
      expect(cleared?.config?.pausedBy).toBeUndefined();
      expect(cleared?.config?.acceptance?.metrics).toEqual([{ key: 'followers', target: 1000 }]);
    });

    it('starts from an empty object when the orchestration workflow has no config yet', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'No config',
      });

      await orchestrationWorkflowModel.updatePauseReason(
        orchestrationWorkflow.id,
        'measured_acceptance',
      );

      expect(
        (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config?.pausedBy,
      ).toBe('measured_acceptance');
    });

    it('does not reach an orchestration workflow owned by somebody else', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Owned',
      });

      await new OrchestrationWorkflowModel(serverDB, otherUserId).updatePauseReason(
        orchestrationWorkflow.id,
        'measured_acceptance',
      );

      expect(
        (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config?.pausedBy,
      ).toBeUndefined();
    });
  });

  describe('findByGraphTask', () => {
    it('finds the orchestration workflow whose graph owns a Task', async () => {
      const task = await new TaskModel(serverDB, userId).create({ instruction: 'do the work' });
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Owner',
      });
      const node = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'task',
        title: 'W1',
      });
      await serverDB
        .update(orchestrationWorkflowNodes)
        .set({ taskId: task.id })
        .where(eq(orchestrationWorkflowNodes.id, node!.id));

      expect((await orchestrationWorkflowModel.findByGraphTask(task.id))?.id).toBe(
        orchestrationWorkflow.id,
      );
    });

    it('does not cross user boundaries', async () => {
      const otherOrchestrationWorkflows = new OrchestrationWorkflowModel(serverDB, otherUserId);
      const otherGraph = new OrchestrationWorkflowGraphModel(serverDB, otherUserId);
      const task = await new TaskModel(serverDB, otherUserId).create({ instruction: 'theirs' });
      const orchestrationWorkflow = await otherOrchestrationWorkflows.create({
        subjectType: 'standalone',
        title: 'Theirs',
      });
      const node = await otherGraph.createNode(orchestrationWorkflow.id, {
        kind: 'task',
        title: 'W1',
      });
      await serverDB
        .update(orchestrationWorkflowNodes)
        .set({ taskId: task.id })
        .where(eq(orchestrationWorkflowNodes.id, node!.id));

      expect(await orchestrationWorkflowModel.findByGraphTask(task.id)).toBeUndefined();
    });
  });

  describe('list', () => {
    it('lists orchestration workflows the caller owns, newest first, with the graph roll-up', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Reproduce it',
      });
      const problem = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'problem',
        title: 'P1',
      });
      const done = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'task',
        title: 'W1',
      });
      await graphModel.createNode(orchestrationWorkflow.id, { kind: 'task', title: 'W2' });
      await graphModel.createNode(orchestrationWorkflow.id, { kind: 'finding', title: 'F1' });
      await graphModel.createEdge(orchestrationWorkflow.id, problem!.id, done!.id, 'decomposes');
      await graphModel.updateNodeStatus(orchestrationWorkflow.id, done!.id, 'resolved');

      const { orchestrationWorkflows, total } = await orchestrationWorkflowModel.list();

      expect(total).toBe(1);
      expect(orchestrationWorkflows[0]).toMatchObject({
        findingCount: 1,
        pendingDecisions: 0,
        taskDone: 1,
        taskTotal: 2,
      });
      expect(orchestrationWorkflows[0].orchestrationWorkflow.id).toBe(orchestrationWorkflow.id);
    });

    it('rolls task run cost and duration up into the listed orchestration workflow', async () => {
      const task = await new TaskModel(serverDB, userId).create({ instruction: 'measured work' });
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Measured',
      });
      const node = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'task',
        title: 'W1',
      });
      await serverDB
        .update(orchestrationWorkflowNodes)
        .set({ taskId: task.id })
        .where(eq(orchestrationWorkflowNodes.id, node!.id));
      await serverDB.insert(topics).values({
        completedAt: new Date('2026-08-06T10:03:00.000Z'),
        id: 'orchestration-workflow-measured-run',
        totalCost: 0.04,
        userId,
      });
      await serverDB.insert(taskTopics).values({
        createdAt: new Date('2026-08-06T10:00:00.000Z'),
        seq: 1,
        taskId: task.id,
        topicId: 'orchestration-workflow-measured-run',
        userId,
      });

      const [item] = (await orchestrationWorkflowModel.list()).orchestrationWorkflows;

      expect(item.totalRunCost).toBeCloseTo(0.04);
      expect(item.totalRunDuration).toBe(180_000);
    });

    it('counts only the decision gates still waiting on a human', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Gated',
      });
      const open = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'decision',
        title: 'D1',
      });
      const closed = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'decision',
        title: 'D2',
      });
      await graphModel.createDecision(orchestrationWorkflow.id, open!.id, {
        authority: 'user',
        question: 'retry?',
      });
      await graphModel.createDecision(orchestrationWorkflow.id, closed!.id, {
        authority: 'user',
        question: 'retire?',
      });
      await serverDB
        .update(orchestrationWorkflowNodeDecisions)
        .set({ status: 'resolved' })
        .where(eq(orchestrationWorkflowNodeDecisions.nodeId, closed!.id));

      expect(
        (await orchestrationWorkflowModel.list()).orchestrationWorkflows[0].pendingDecisions,
      ).toBe(1);
    });

    it('does not leak another user’s orchestration workflows', async () => {
      await new OrchestrationWorkflowModel(serverDB, otherUserId).create({
        subjectType: 'standalone',
        title: 'Not mine',
      });

      expect((await orchestrationWorkflowModel.list()).total).toBe(0);
    });

    it('scopes by the orchestration workflow’s responsible agent', async () => {
      const mine = 'orchestration-workflow-list-agent-a';
      const theirs = 'orchestration-workflow-list-agent-b';
      await serverDB.insert(agents).values(
        await withTestAgentDevices(serverDB, [
          { id: mine, slug: mine, userId },
          { id: theirs, slug: theirs, userId },
        ]),
      );
      const ours = await orchestrationWorkflowModel.create({
        agentId: mine,
        subjectType: 'standalone',
        title: 'Mine',
      });
      const others = await orchestrationWorkflowModel.create({
        agentId: theirs,
        subjectType: 'standalone',
        title: 'Theirs',
      });
      await graphModel.createNode(ours.id, { kind: 'task', title: 'W1' });
      await graphModel.createNode(others.id, { kind: 'task', title: 'W1' });

      const scoped = await orchestrationWorkflowModel.list({ agentId: mine });
      expect(scoped.total).toBe(1);
      expect(scoped.orchestrationWorkflows[0].orchestrationWorkflow.title).toBe('Mine');
    });

    it('leaves out an orchestration workflow that never got a graph', async () => {
      // Rows from the earlier task-carried flow have no `orchestration_workflow_nodes`. Listing
      // them renders a orchestration workflow page with no tasks, no frontier and no way forward.
      const legacy = await orchestrationWorkflowModel.create({
        subjectType: 'task',
        title: 'Carrier-bound',
      });
      const graphed = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Has a graph',
      });
      await graphModel.createNode(graphed.id, { kind: 'task', title: 'W1' });

      const { orchestrationWorkflows, total } = await orchestrationWorkflowModel.list();

      expect(total).toBe(1);
      expect(
        orchestrationWorkflows.map(({ orchestrationWorkflow }) => orchestrationWorkflow.id),
      ).toEqual([graphed.id]);
      expect(
        orchestrationWorkflows.map(({ orchestrationWorkflow }) => orchestrationWorkflow.id),
      ).not.toContain(legacy.id);
    });

    it('filters by lifecycle status', async () => {
      const running = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Running',
      });
      const achieved = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Achieved',
      });
      await graphModel.createNode(running.id, { kind: 'task', title: 'W1' });
      await graphModel.createNode(achieved.id, { kind: 'task', title: 'W1' });
      await orchestrationWorkflowModel.updateStatus(running.id, 'running');
      await orchestrationWorkflowModel.updateStatus(achieved.id, 'achieved');

      const open = await orchestrationWorkflowModel.list({ statuses: ['running'] });
      expect(
        open.orchestrationWorkflows.map(({ orchestrationWorkflow }) => orchestrationWorkflow.title),
      ).toEqual(['Running']);
    });
  });

  describe('listStalled', () => {
    const staleBefore = () => new Date(Date.now() - 15 * 60 * 1000);

    it('picks up an open orchestration workflow with nothing running', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Never started',
      });
      await orchestrationWorkflowModel.updateStatus(orchestrationWorkflow.id, 'running');
      await graphModel.createNode(orchestrationWorkflow.id, { kind: 'task', title: 'W1' });

      const stalled = await OrchestrationWorkflowModel.listStalled(serverDB, {
        staleBefore: staleBefore(),
      });
      expect(stalled.map(({ id }) => id)).toContain(orchestrationWorkflow.id);
    });

    it('leaves out an orchestration workflow that never got a graph', async () => {
      // No graph means no frontier, so every sweep would tick it only to hear
      // `no_progress` back.
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'task',
        title: 'Carrier-bound',
      });
      await orchestrationWorkflowModel.updateStatus(orchestrationWorkflow.id, 'running');

      const stalled = await OrchestrationWorkflowModel.listStalled(serverDB, {
        staleBefore: staleBefore(),
      });
      expect(stalled.map(({ id }) => id)).not.toContain(orchestrationWorkflow.id);
    });

    it('leaves an orchestration workflow alone while one of its Tasks is freshly active', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Working',
      });
      await orchestrationWorkflowModel.updateStatus(orchestrationWorkflow.id, 'running');
      const node = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'task',
        title: 'W1',
      });
      await graphModel.updateNodeStatus(orchestrationWorkflow.id, node!.id, 'active');

      const stalled = await OrchestrationWorkflowModel.listStalled(serverDB, {
        staleBefore: staleBefore(),
      });
      expect(stalled.map(({ id }) => id)).not.toContain(orchestrationWorkflow.id);
    });

    it('reclaims a Task that outlived its operation lease', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Lost',
      });
      await orchestrationWorkflowModel.updateStatus(orchestrationWorkflow.id, 'running');
      const node = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'task',
        title: 'W1',
      });
      await graphModel.updateNodeStatus(orchestrationWorkflow.id, node!.id, 'active');
      await serverDB
        .update(orchestrationWorkflowNodes)
        .set({ updatedAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where(eq(orchestrationWorkflowNodes.id, node!.id));

      const stalled = await OrchestrationWorkflowModel.listStalled(serverDB, {
        staleBefore: staleBefore(),
      });
      expect(stalled.map(({ id }) => id)).toContain(orchestrationWorkflow.id);
    });

    it('skips an orchestration workflow whose next move belongs to a human', async () => {
      // Ticking a orchestration workflow parked on a decision gate only re-reports `waiting_human`
      // on every sweep; only the user can move it.
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Gated',
      });
      await orchestrationWorkflowModel.updateStatus(orchestrationWorkflow.id, 'running');
      const gate = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'decision',
        title: 'D1',
      });
      await graphModel.createDecision(orchestrationWorkflow.id, gate!.id, {
        authority: 'user',
        question: 'retry?',
      });

      const stalled = await OrchestrationWorkflowModel.listStalled(serverDB, {
        staleBefore: staleBefore(),
      });
      expect(stalled.map(({ id }) => id)).not.toContain(orchestrationWorkflow.id);
    });

    it.each(['achieved', 'failed', 'canceled', 'paused'] as const)(
      'never sweeps a %s orchestration workflow',
      async (status) => {
        const orchestrationWorkflow = await orchestrationWorkflowModel.create({
          subjectType: 'standalone',
          title: status,
        });
        await orchestrationWorkflowModel.updateStatus(orchestrationWorkflow.id, status);
        await graphModel.createNode(orchestrationWorkflow.id, { kind: 'task', title: 'W1' });

        const stalled = await OrchestrationWorkflowModel.listStalled(serverDB, {
          staleBefore: staleBefore(),
        });
        expect(stalled.map(({ id }) => id)).not.toContain(orchestrationWorkflow.id);
      },
    );
  });

  describe('updateStatus', () => {
    it('stamps startedAt on first entry into running', async () => {
      const { id } = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Lifecycle orchestration workflow',
      });

      const running = await orchestrationWorkflowModel.updateStatus(id, 'running');
      expect(running?.status).toBe('running');
      expect(running?.startedAt).toBeInstanceOf(Date);

      // A later transition keeps the original startedAt.
      const verifying = await orchestrationWorkflowModel.updateStatus(id, 'verifying');
      expect(verifying?.startedAt).toEqual(running?.startedAt);
    });

    it('stamps completedAt on terminal states and clears it on re-open', async () => {
      const { id } = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Terminal orchestration workflow',
      });

      const achieved = await orchestrationWorkflowModel.updateStatus(id, 'achieved');
      expect(achieved?.completedAt).toBeInstanceOf(Date);

      const reopened = await orchestrationWorkflowModel.updateStatus(id, 'running');
      expect(reopened?.completedAt).toBeNull();
    });

    it('returns undefined for an orchestration workflow outside the scope', async () => {
      const otherModel = new OrchestrationWorkflowModel(serverDB, otherUserId);
      const { id } = await otherModel.create({ subjectType: 'standalone', title: 'Not mine' });

      expect(await orchestrationWorkflowModel.updateStatus(id, 'running')).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('cascades the whole graph away with the orchestration workflow', async () => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        subjectType: 'standalone',
        title: 'Doomed',
      });
      const problem = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'problem',
        title: 'P1',
      });
      const work = await graphModel.createNode(orchestrationWorkflow.id, {
        kind: 'task',
        title: 'W1',
      });
      await graphModel.createEdge(orchestrationWorkflow.id, problem!.id, work!.id, 'decomposes');

      await orchestrationWorkflowModel.delete(orchestrationWorkflow.id);

      expect(
        await serverDB.query.orchestrationWorkflowNodes.findMany({
          where: eq(orchestrationWorkflowNodes.orchestrationWorkflowId, orchestrationWorkflow.id),
        }),
      ).toHaveLength(0);
      expect(
        await serverDB.query.orchestrationWorkflowEdges.findMany({
          where: eq(orchestrationWorkflowEdges.orchestrationWorkflowId, orchestrationWorkflow.id),
        }),
      ).toHaveLength(0);
    });
  });
});

describe('planning leases', () => {
  it('does not take over a running orchestration workflow claimed by a legacy worker', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      title: 'Legacy planner',
      status: 'running',
    });
    expect(
      await orchestrationWorkflowModel.claimPlanning(orchestrationWorkflow.id),
    ).toBeUndefined();
    expect(
      (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config
        ?.planningCheckpoint,
    ).toBeUndefined();
  });

  it.each([
    null,
    { acceptance: { criteriaIds: ['updated-criterion'] } },
    { acceptance: { metrics: [{ key: 'followers', target: 1000 }] } },
    { schedule: { deadline: null } },
  ])(
    'preserves the lease across a stale config replacement (%j) without resurrecting a released token',
    async (config) => {
      const orchestrationWorkflow = await orchestrationWorkflowModel.create({
        title: 'Config race',
        config: { pausedBy: 'user' },
      });
      const claim = await orchestrationWorkflowModel.claimPlanning(orchestrationWorkflow.id);
      const claimed = await orchestrationWorkflowModel.findById(orchestrationWorkflow.id);
      await orchestrationWorkflowModel.update(orchestrationWorkflow.id, { config });
      expect(
        (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config
          ?.planningCheckpoint?.token,
      ).toBe(claim!.token);
      expect(
        await orchestrationWorkflowModel.claimPlanning(orchestrationWorkflow.id),
      ).toBeUndefined();

      await orchestrationWorkflowModel.releasePlanning(orchestrationWorkflow.id, claim!.token);
      await orchestrationWorkflowModel.update(orchestrationWorkflow.id, {
        config: claimed!.config,
      });
      expect(
        (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config
          ?.planningCheckpoint,
      ).toBeUndefined();
      // A lease-aware orchestration workflow can retry; a legacy running orchestration workflow cannot.
      expect(
        await orchestrationWorkflowModel.claimPlanning(orchestrationWorkflow.id),
      ).toBeDefined();
    },
  );

  it('keeps the reply boundary and confirmation across a stale config write-back', async () => {
    const definition = await orchestrationWorkflowModel.create({
      title: 'Confirmation race',
      config: { pausedBy: 'user' },
    });
    const stale = await orchestrationWorkflowModel.findById(definition.id);
    const plan = { topicId: 'topic', postedMessageId: 'msg', postedAt: '2026-10-13T12:00:00.000Z' };
    await orchestrationWorkflowModel.setConversationPlan(definition.id, plan);
    await orchestrationWorkflowModel.confirmPlan(definition.id, '2026-10-13T13:00:00.000Z');
    await orchestrationWorkflowModel.confirmPlan(definition.id, '2030-01-01T00:00:00.000Z');

    // A policy editor writes back its pre-post copy of the whole config.
    await orchestrationWorkflowModel.update(definition.id, {
      config: { ...stale!.config, acceptance: { criteriaIds: ['c'] } },
    });
    // A stale copy that carries a forged or outdated confirmation cannot override it either.
    await orchestrationWorkflowModel.update(definition.id, {
      config: { planConfirmedAt: 'forged', conversationPlan: { ...plan, topicId: 'other' } },
    });
    await orchestrationWorkflowModel.update(definition.id, { config: null });

    expect((await orchestrationWorkflowModel.findById(definition.id))?.config).toMatchObject({
      conversationPlan: plan,
      planConfirmedAt: '2026-10-13T13:00:00.000Z',
    });
  });

  it('allows one owner, fences expired owners, and preserves unrelated config on release', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      title: 'Planning lease',
      config: { pausedBy: 'user' },
    });
    const first = await orchestrationWorkflowModel.claimPlanning(orchestrationWorkflow.id);
    expect(first).toBeDefined();
    expect(
      await orchestrationWorkflowModel.claimPlanning(orchestrationWorkflow.id),
    ).toBeUndefined();
    expect(
      await new OrchestrationWorkflowModel(serverDB, otherUserId).claimPlanning(
        orchestrationWorkflow.id,
      ),
    ).toBeUndefined();
    await new OrchestrationWorkflowModel(serverDB, otherUserId).releasePlanning(
      orchestrationWorkflow.id,
      first!.token,
    );
    expect(
      (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config
        ?.planningCheckpoint?.token,
    ).toBe(first!.token);
    await serverDB
      .update(orchestrationWorkflows)
      .set({
        config: {
          pausedBy: 'user',
          planningProtocol: 'lease-v1',
          planningCheckpoint: { token: first!.token, expiresAt: '2000-01-01T00:00:00.000Z' },
        },
      })
      .where(eq(orchestrationWorkflows.id, orchestrationWorkflow.id));
    const second = await orchestrationWorkflowModel.claimPlanning(orchestrationWorkflow.id);
    expect(second?.token).not.toBe(first!.token);
    await orchestrationWorkflowModel.releasePlanning(orchestrationWorkflow.id, first!.token);
    expect(
      (await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config
        ?.planningCheckpoint?.token,
    ).toBe(second!.token);
    await orchestrationWorkflowModel.releasePlanning(orchestrationWorkflow.id, second!.token);
    expect((await orchestrationWorkflowModel.findById(orchestrationWorkflow.id))?.config).toEqual({
      pausedBy: 'user',
      planningProtocol: 'lease-v1',
    });
  });
});
