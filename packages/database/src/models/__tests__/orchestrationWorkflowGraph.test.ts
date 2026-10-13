// @vitest-environment node
import { ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID } from '@orvilo/const/orchestrationWorkflow';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  agents,
  orchestrationWorkflowNodes,
  orchestrationWorkflows,
  users,
  workspaces,
} from '../../schemas';
import type { OrviloDatabase } from '../../type';
import { OrchestrationWorkflowModel } from '../orchestrationWorkflow';
import { OrchestrationWorkflowGraphModel } from '../orchestrationWorkflowGraph';
import { TaskModel } from '../task';
import { WorkModel } from '../work';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'orchestration-workflow-graph-test-user';
const otherUserId = 'orchestration-workflow-graph-other-user';

const orchestrationWorkflowModel = new OrchestrationWorkflowModel(serverDB, userId);
const graphModel = new OrchestrationWorkflowGraphModel(serverDB, userId);

beforeEach(async () => {
  await serverDB.delete(users);
  await serverDB.insert(users).values([{ id: userId }, { id: otherUserId }]);
});

afterEach(async () => {
  await serverDB.delete(users);
});

describe('OrchestrationWorkflowGraphModel', () => {
  it('creates nodes and edges with an atomic event trail', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Reproduce Ornith',
    });
    const problem = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'problem',
      title: 'Can the published specification reproduce the system?',
    });
    const work = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Implement the minimal training loop',
    });

    const edge = await graphModel.createEdge(
      orchestrationWorkflow.id,
      problem!.id,
      work!.id,
      'leads_to',
    );
    const graph = await graphModel.getGraph(orchestrationWorkflow.id);

    expect(edge).toMatchObject({
      orchestrationWorkflowId: orchestrationWorkflow.id,
      kind: 'leads_to',
    });
    expect(graph?.nodes).toHaveLength(2);
    expect(graph?.edges).toHaveLength(1);
    // Newest first — getGraph bounds and orders the trail for the polling UI.
    expect(graph?.events.map((event) => event.eventType)).toEqual(['linked', 'created', 'created']);
  });

  it('records who made each transition', async () => {
    // Every event used to be attributed to the orchestration workflow's owner, because the model
    // falls back to its `userId` — which made a move the coordinator decided on
    // its own indistinguishable from one a person made.
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Attributed',
    });
    const coordinator = new OrchestrationWorkflowGraphModel(serverDB, userId, undefined, {
      id: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
      type: 'system',
    });

    const byUser = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Asked for',
    });
    const bySystem = await coordinator.createNode(orchestrationWorkflow.id, {
      kind: 'finding',
      title: 'Concluded',
    });
    await serverDB.insert(agents).values({ id: 'agt_author', slug: 'agt-author', userId });
    const byAgent = await coordinator.createNode(orchestrationWorkflow.id, {
      createdByAgentId: 'agt_author',
      kind: 'finding',
      title: 'Written by an agent',
    });

    const { events } = (await graphModel.getGraph(orchestrationWorkflow.id))!;
    const actorOf = (nodeId: string) => {
      const event = events.find((item) => item.entityId === nodeId);
      return { actorId: event?.actorId, actorType: event?.actorType };
    };

    expect(actorOf(byUser!.id)).toEqual({ actorId: userId, actorType: 'user' });
    expect(actorOf(bySystem!.id)).toEqual({
      actorId: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
      actorType: 'system',
    });
    // An explicit agent author still wins over the instance actor.
    expect(actorOf(byAgent!.id)).toEqual({ actorId: 'agt_author', actorType: 'agent' });
  });

  it('creates a synthesized node only once when coordinators race', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Concurrent synthesis',
    });
    const input = {
      kind: 'task' as const,
      title: 'Complete full Orchestration workflow acceptance',
    };

    const results = await Promise.all([
      graphModel.createNodeOnce(orchestrationWorkflow.id, input),
      graphModel.createNodeOnce(orchestrationWorkflow.id, input),
    ]);
    const graph = await graphModel.getGraph(orchestrationWorkflow.id);

    expect(results.filter((result) => result?.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result?.node.id))).toHaveLength(1);
    expect(graph?.nodes).toHaveLength(1);
    expect(graph?.events).toHaveLength(1);
  });

  it('creates and resolves a durable human decision', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Decision orchestration workflow',
    });
    const node = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'decision',
      title: 'Choose verifier',
    });
    const decision = await graphModel.createDecision(orchestrationWorkflow.id, node!.id, {
      authority: 'user',
      options: [
        { id: 'harden', label: 'Harden verifier' },
        { id: 'continue', label: 'Continue training' },
      ],
      question: 'Which branch should run next?',
      recommendedOptionId: 'harden',
    });

    const resolved = await graphModel.resolveDecision(
      orchestrationWorkflow.id,
      decision!.id,
      'harden',
      'Safer first',
    );
    const graph = await graphModel.getGraph(orchestrationWorkflow.id);

    expect(resolved).toMatchObject({ resolvedOptionId: 'harden', status: 'resolved' });
    expect(graph?.nodes[0]).toMatchObject({ status: 'resolved' });
    expect(graph?.decisions[0]).toMatchObject({ resolution: 'Safer first', status: 'resolved' });
  });

  it('allows only one concurrent resolution of a pending decision', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Decision race',
    });
    const node = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'decision',
      title: 'Choose once',
    });
    const decision = await graphModel.createDecision(orchestrationWorkflow.id, node!.id, {
      authority: 'user',
      options: [
        { id: 'retry', label: 'Retry' },
        { id: 'retire', label: 'Retire' },
      ],
      question: 'Which outcome wins?',
    });

    const results = await Promise.all([
      graphModel.resolveDecision(orchestrationWorkflow.id, decision!.id, 'retry'),
      graphModel.resolveDecision(orchestrationWorkflow.id, decision!.id, 'retire'),
    ]);
    const graph = await graphModel.getGraph(orchestrationWorkflow.id);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(graph?.events.filter((event) => event.eventType === 'resolved')).toHaveLength(1);
    expect(graph?.decisions[0].resolvedOptionId).toBe(results.find(Boolean)!.resolvedOptionId);
  });

  it('allows only one task binding for a task node', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Task binding race',
    });
    const node = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Run once',
    });
    const taskModel = new TaskModel(serverDB, userId);
    const [firstTask, secondTask] = await Promise.all([
      taskModel.create({ instruction: 'First candidate' }),
      taskModel.create({ instruction: 'Second candidate' }),
    ]);

    expect(
      await graphModel.claimTaskNode(orchestrationWorkflow.id, node!.id, new Date(0)),
    ).toBeDefined();
    const bindings = await Promise.all([
      graphModel.bindTask(orchestrationWorkflow.id, node!.id, firstTask.id),
      graphModel.bindTask(orchestrationWorkflow.id, node!.id, secondTask.id),
    ]);
    const graph = await graphModel.getGraph(orchestrationWorkflow.id);

    expect(bindings.filter(Boolean)).toHaveLength(1);
    expect(graph?.nodes[0].taskId).toBe(bindings.find(Boolean)!.taskId);
    expect(graph?.events.filter((event) => event.entityType === 'task')).toHaveLength(1);
  });

  it('refuses to bind a task to a node that is not a task node', async () => {
    // This used to be a CHECK constraint. It lives in `bindTask`'s WHERE now,
    // so the rule needs a test on the write path or nothing enforces it.
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Wrong kind',
    });
    const finding = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'finding',
      title: 'A finding',
    });
    const task = await new TaskModel(serverDB, userId).create({ instruction: 'Should not bind' });

    expect(
      await graphModel.bindTask(orchestrationWorkflow.id, finding!.id, task.id),
    ).toBeUndefined();
    expect((await graphModel.getGraph(orchestrationWorkflow.id))?.nodes[0].taskId).toBeNull();
  });

  it('allows an abandoned work claim to be recovered after its lease expires', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Recover claim',
    });
    const node = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Recoverable work',
    });

    expect(
      await graphModel.claimTaskNode(orchestrationWorkflow.id, node!.id, new Date(0)),
    ).toBeDefined();
    expect(
      await graphModel.claimTaskNode(orchestrationWorkflow.id, node!.id, new Date(0)),
    ).toBeUndefined();

    await serverDB
      .update(orchestrationWorkflowNodes)
      .set({ updatedAt: new Date('2020-01-01') })
      .where(eq(orchestrationWorkflowNodes.id, node!.id));

    expect(
      await graphModel.claimTaskNode(orchestrationWorkflow.id, node!.id, new Date('2021-01-01')),
    ).toBeDefined();
  });

  it('pins an immutable Work version to an owned graph node', async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Evidence orchestration workflow',
    });
    const node = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Produce evidence',
    });
    const task = await new TaskModel(serverDB, userId).create({ instruction: 'Produce evidence' });
    const work = await new WorkModel(serverDB, userId).registerTask({
      changeType: 'created',
      taskId: task.id,
      toolIdentifier: 'orchestration-workflow-test',
      toolName: 'createTask',
    });

    const link = await graphModel.attachWorkVersion(
      orchestrationWorkflow.id,
      node!.id,
      work!.currentVersionId!,
      'produced',
    );

    expect(link).toMatchObject({ nodeId: node!.id, relation: 'produced' });
    const links = (await graphModel.getGraph(orchestrationWorkflow.id))?.workVersions;
    expect(links).toHaveLength(1);
    // Personal mode: the Work ownership predicate the workspace case needs must
    // not hide the owner's own deliverable from their own orchestration workflow.
    expect(links?.[0].work).toMatchObject({ type: 'task', workId: work!.id });
  });

  it('hydrates a linked Work only for a viewer allowed to see it', async () => {
    // A workspace orchestration workflow is readable by every member (`orchestration workflows` has no visibility
    // column), but a Work is owner-scoped. Hydrating the link without the Work
    // ownership predicate handed another member the owner's private title,
    // status, url and document binding.
    const workspaceId = 'orchestration-workflow-graph-workspace';
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Orchestration workflow graph workspace',
      primaryOwnerId: userId,
      slug: 'orchestration-workflow-graph-workspace',
    });
    const ownerOrchestrationWorkflows = new OrchestrationWorkflowModel(
      serverDB,
      userId,
      workspaceId,
    );
    const ownerGraph = new OrchestrationWorkflowGraphModel(serverDB, userId, workspaceId);
    const orchestrationWorkflow = await ownerOrchestrationWorkflows.create({
      subjectType: 'standalone',
      title: 'Shared orchestration workflow',
    });
    await serverDB
      .update(orchestrationWorkflows)
      .set({ workspaceId })
      .where(eq(orchestrationWorkflows.id, orchestrationWorkflow.id));
    const node = await ownerGraph.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Produce evidence',
    });

    const work = await new WorkModel(serverDB, userId, workspaceId).registerExternal({
      changeType: 'created',
      resourceId: 'alexj11324/orvilo1#1',
      resourceType: 'github_issue',
      title: 'Private follow-up issue',
      toolIdentifier: 'orchestration-workflow-test',
      toolName: 'createIssue',
      url: 'https://github.com/alexj11324/orvilo1/issues/1',
    });
    await ownerGraph.attachWorkVersion(
      orchestrationWorkflow.id,
      node!.id,
      work!.currentVersionId!,
      'produced',
    );

    const asOwner = await ownerGraph.getGraph(orchestrationWorkflow.id);
    expect(asOwner?.workVersions[0].work).toMatchObject({ title: 'Private follow-up issue' });

    // The other member reaches the same orchestration workflow and the same link…
    const asMember = await new OrchestrationWorkflowGraphModel(
      serverDB,
      otherUserId,
      workspaceId,
    ).getGraph(orchestrationWorkflow.id);
    expect(asMember?.workVersions).toHaveLength(1);
    // …but the Work behind it stays unresolved rather than naming itself.
    expect(asMember?.workVersions[0].work).toBeUndefined();
  });

  it('does not expose or mutate another user graph', async () => {
    const otherOrchestrationWorkflowModel = new OrchestrationWorkflowModel(serverDB, otherUserId);
    const otherGraphModel = new OrchestrationWorkflowGraphModel(serverDB, otherUserId);
    const orchestrationWorkflow = await otherOrchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Private graph',
    });
    const node = await otherGraphModel.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Private work',
    });

    expect(await graphModel.getGraph(orchestrationWorkflow.id)).toBeUndefined();
    expect(
      await graphModel.updateNodeStatus(orchestrationWorkflow.id, node!.id, 'resolved'),
    ).toBeUndefined();

    const graph = await otherGraphModel.getGraph(orchestrationWorkflow.id);
    expect(graph?.nodes[0].status).toBe('proposed');
    expect(graph?.events).toHaveLength(1);
  });

  it('caps the events a graph read carries, newest first', async () => {
    // The detail page polls getGraph every few seconds; without a limit a
    // long-horizon orchestration workflow's payload grew linearly with its age.
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Noisy graph',
    });
    const node = await graphModel.createNode(orchestrationWorkflow.id, {
      kind: 'task',
      title: 'Churn',
    });
    for (let i = 0; i < OrchestrationWorkflowGraphModel.GRAPH_EVENT_LIMIT + 5; i++) {
      await graphModel.updateNodeStatus(
        orchestrationWorkflow.id,
        node!.id,
        i % 2 ? 'active' : 'waiting',
      );
    }

    const graph = await graphModel.getGraph(orchestrationWorkflow.id);

    expect(graph?.events).toHaveLength(OrchestrationWorkflowGraphModel.GRAPH_EVENT_LIMIT);
    const createdAt = graph!.events.map((event) => event.createdAt.getTime());
    expect([...createdAt].sort((a, b) => b - a)).toEqual(createdAt);
    expect(graph!.events[0].eventType).toBe('updated');
  });

  it('records a orchestration-workflow-level status transition as a system-attributed event', async () => {
    // The lifecycle event types existed in the schema but nothing wrote them,
    // so a orchestration workflow's planning → running → paused path left no trace at all.
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      subjectType: 'standalone',
      title: 'Status trail',
    });
    const coordinator = new OrchestrationWorkflowGraphModel(serverDB, userId, undefined, {
      id: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
      type: 'system',
    });

    await coordinator.recordOrchestrationWorkflowStatus(
      orchestrationWorkflow.id,
      'planning',
      'running',
    );
    await coordinator.recordOrchestrationWorkflowStatus(
      orchestrationWorkflow.id,
      'running',
      'paused',
      'nothing ready',
    );
    // A same-status write is a no-op — re-stamping would flood the timeline.
    await coordinator.recordOrchestrationWorkflowStatus(
      orchestrationWorkflow.id,
      'paused',
      'paused',
    );

    const events = (await graphModel.getGraph(orchestrationWorkflow.id))!.events.filter(
      (event) => event.entityType === 'orchestrationWorkflow',
    );

    expect(events).toHaveLength(2);
    // Newest first: [1] is the earlier activation, [0] the later pause.
    expect(events[1]).toMatchObject({
      actorId: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
      actorType: 'system',
      entityId: orchestrationWorkflow.id,
      eventType: 'activated',
      reason: 'status planning → running',
    });
    expect(events[0]).toMatchObject({
      eventType: 'updated',
      reason: 'nothing ready',
    });
  });
});

// PGlite has a single connection and cannot model PostgreSQL reader/writer concurrency.
it.skipIf(process.env.TEST_SERVER_DB !== '1')(
  'reads a graph while another transaction locks its orchestration workflow',
  async () => {
    const orchestrationWorkflow = await orchestrationWorkflowModel.create({
      title: 'Readable while planning',
    });
    let unlock!: () => void;
    let acquired!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const writer = serverDB.transaction(async (tx) => {
      await new OrchestrationWorkflowModel(tx, userId).findByIdForUpdate(orchestrationWorkflow.id);
      acquired();
      await gate;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([ready, writer]);
      const graph = await Promise.race([
        graphModel.getGraph(orchestrationWorkflow.id),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Graph refresh waited for a write lock')),
            2000,
          );
        }),
      ]);
      expect(graph?.orchestrationWorkflow.id).toBe(orchestrationWorkflow.id);
    } finally {
      if (timeout) clearTimeout(timeout);
      unlock();
      await writer;
    }
  },
);
