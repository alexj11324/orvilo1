// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  orchestrationWorkflowEdges,
  orchestrationWorkflowEvents,
  orchestrationWorkflowNodeDecisions,
  orchestrationWorkflowNodes,
  orchestrationWorkflowNodeWorkVersions,
  orchestrationWorkflows,
  tasks,
  users,
  works,
  workVersions,
} from '..';

const serverDB = await getTestDB();
const userId = 'orchestration-workflow-graph-schema-test-user';

beforeEach(async () => {
  await serverDB.insert(users).values({ id: userId });
});

afterEach(async () => {
  await serverDB.delete(users).where(eq(users.id, userId));
});

const startOrchestrationWorkflow = async () => {
  const [orchestrationWorkflow] = await serverDB
    .insert(orchestrationWorkflows)
    .values({ title: 'Reproduce the Ornith training system', userId })
    .returning();

  return orchestrationWorkflow;
};

describe('Orchestration workflow Graph schema', () => {
  it('persists graph structure, a durable decision, evidence, and its audit trail', async () => {
    const orchestrationWorkflow = await startOrchestrationWorkflow();
    const [task] = await serverDB
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'ORN-1',
        instruction: 'Implement the minimal training loop',
        seq: 1,
      })
      .returning();
    const [problemNode, taskNode, findingNode, decisionNode] = await serverDB
      .insert(orchestrationWorkflowNodes)
      .values([
        {
          orchestrationWorkflowId: orchestrationWorkflow.id,
          kind: 'problem',
          status: 'active',
          title: 'Is the public spec sufficient?',
        },
        {
          orchestrationWorkflowId: orchestrationWorkflow.id,
          kind: 'task',
          status: 'active',
          taskId: task.id,
          title: 'Implement the minimal training loop',
        },
        {
          orchestrationWorkflowId: orchestrationWorkflow.id,
          kind: 'finding',
          status: 'resolved',
          title: 'Verifier is vulnerable',
        },
        {
          orchestrationWorkflowId: orchestrationWorkflow.id,
          kind: 'decision',
          status: 'waiting',
          title: 'Strengthen verifier first',
        },
      ])
      .returning();

    await serverDB.insert(orchestrationWorkflowEdges).values([
      {
        orchestrationWorkflowId: orchestrationWorkflow.id,
        kind: 'investigates',
        sourceNodeId: taskNode.id,
        targetNodeId: problemNode.id,
      },
      {
        orchestrationWorkflowId: orchestrationWorkflow.id,
        kind: 'produces',
        sourceNodeId: taskNode.id,
        targetNodeId: findingNode.id,
      },
      {
        orchestrationWorkflowId: orchestrationWorkflow.id,
        kind: 'leads_to',
        sourceNodeId: findingNode.id,
        targetNodeId: decisionNode.id,
      },
    ]);
    await serverDB.insert(orchestrationWorkflowNodeDecisions).values({
      authority: 'user',
      nodeId: decisionNode.id,
      options: [
        { id: 'strengthen', label: 'Strengthen verifier' },
        { id: 'continue', label: 'Continue training' },
      ],
      question: 'Should verifier robustness be addressed before training continues?',
      recommendedOptionId: 'strengthen',
      requestedUserId: userId,
    });

    const [work] = await serverDB
      .insert(works)
      .values({
        resourceId: task.id,
        resourceType: 'task',
        title: 'Verifier attack report',
        toolIdentifier: 'orvilo-task',
        toolName: 'createTask',
        type: 'task',
        userId,
        visibility: 'private',
      })
      .returning();
    const [workVersion] = await serverDB
      .insert(workVersions)
      .values({
        changeType: 'created',
        title: 'Verifier attack report',
        toolIdentifier: 'orvilo-task',
        toolName: 'createTask',
        version: 1,
        workId: work.id,
      })
      .returning();
    await serverDB.insert(orchestrationWorkflowNodeWorkVersions).values({
      nodeId: findingNode.id,
      relation: 'supports',
      workVersionId: workVersion.id,
    });
    await serverDB.insert(orchestrationWorkflowEvents).values({
      actorType: 'agent',
      entityId: findingNode.id,
      entityType: 'node',
      eventType: 'resolved',
      orchestrationWorkflowId: orchestrationWorkflow.id,
      reason: 'Attack evaluation produced reproducible evidence',
      taskId: task.id,
    });

    await expect(
      serverDB
        .select()
        .from(orchestrationWorkflowNodes)
        .where(eq(orchestrationWorkflowNodes.orchestrationWorkflowId, orchestrationWorkflow.id)),
    ).resolves.toHaveLength(4);
    await expect(
      serverDB
        .select()
        .from(orchestrationWorkflowEdges)
        .where(eq(orchestrationWorkflowEdges.orchestrationWorkflowId, orchestrationWorkflow.id)),
    ).resolves.toHaveLength(3);
    await expect(
      serverDB
        .select()
        .from(orchestrationWorkflowNodeDecisions)
        .where(eq(orchestrationWorkflowNodeDecisions.nodeId, decisionNode.id)),
    ).resolves.toMatchObject([{ status: 'pending' }]);
    await expect(
      serverDB
        .select()
        .from(orchestrationWorkflowNodeWorkVersions)
        .where(eq(orchestrationWorkflowNodeWorkVersions.nodeId, findingNode.id)),
    ).resolves.toHaveLength(1);
    await expect(
      serverDB
        .select()
        .from(orchestrationWorkflowEvents)
        .where(eq(orchestrationWorkflowEvents.orchestrationWorkflowId, orchestrationWorkflow.id)),
    ).resolves.toHaveLength(1);
  });

  it('enforces that one task belongs to at most one node', async () => {
    const orchestrationWorkflow = await startOrchestrationWorkflow();
    const [task] = await serverDB
      .insert(tasks)
      .values({
        createdByUserId: userId,
        identifier: 'ORN-2',
        instruction: 'Evaluate task generation strategy',
        seq: 2,
      })
      .returning();

    // Which kinds may own a task is `bindTask`'s job, not the database's — see
    // the model test. The uniqueness below is the part no single write can
    // check for itself, so it stays here.
    await serverDB.insert(orchestrationWorkflowNodes).values({
      orchestrationWorkflowId: orchestrationWorkflow.id,
      kind: 'task',
      taskId: task.id,
      title: 'Evaluate task generation strategy',
    });

    await expect(
      serverDB.insert(orchestrationWorkflowNodes).values({
        orchestrationWorkflowId: orchestrationWorkflow.id,
        kind: 'task',
        taskId: task.id,
        title: 'Duplicate responsible task',
      }),
    ).rejects.toThrow();
  });

  it('rejects self-referencing edges and out-of-range confidence', async () => {
    const orchestrationWorkflow = await startOrchestrationWorkflow();
    const [node] = await serverDB
      .insert(orchestrationWorkflowNodes)
      .values({
        orchestrationWorkflowId: orchestrationWorkflow.id,
        kind: 'problem',
        title: 'Training task quality',
      })
      .returning();

    await expect(
      serverDB.insert(orchestrationWorkflowEdges).values({
        orchestrationWorkflowId: orchestrationWorkflow.id,
        kind: 'depends_on',
        sourceNodeId: node.id,
        targetNodeId: node.id,
      }),
    ).rejects.toThrow();
    await expect(
      serverDB.insert(orchestrationWorkflowNodes).values({
        confidence: '1.001',
        orchestrationWorkflowId: orchestrationWorkflow.id,
        kind: 'finding',
        title: 'Invalid confidence',
      }),
    ).rejects.toThrow();
  });

  it('rejects edges whose endpoints belong to another Orchestration workflow Graph', async () => {
    const orchestrationWorkflowA = await startOrchestrationWorkflow();
    const orchestrationWorkflowB = await startOrchestrationWorkflow();
    const [nodeA, nodeB] = await serverDB
      .insert(orchestrationWorkflowNodes)
      .values([
        {
          orchestrationWorkflowId: orchestrationWorkflowA.id,
          kind: 'problem',
          title: 'Orchestration workflow A problem',
        },
        {
          orchestrationWorkflowId: orchestrationWorkflowB.id,
          kind: 'finding',
          title: 'Orchestration workflow B finding',
        },
      ])
      .returning();

    await expect(
      serverDB.insert(orchestrationWorkflowEdges).values({
        orchestrationWorkflowId: orchestrationWorkflowA.id,
        kind: 'supports',
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
      }),
    ).rejects.toThrow();
  });
});
