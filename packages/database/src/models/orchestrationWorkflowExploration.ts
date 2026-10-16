import { createHash, randomUUID } from 'node:crypto';

import {
  ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE,
  ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
} from '@orvilo/const/orchestrationWorkflow';
import type {
  OrchestrationWorkflowExplorationDecision,
  OrchestrationWorkflowGraphSnapshot,
} from '@orvilo/types';
import {
  experimentOwner,
  experimentScope,
  isProtocolRevision,
  MAX_PROTOCOL_REVISIONS,
  protocolRevisionCount,
} from '@orvilo/utils/orchestrationWorkflowGraph';
import { and, eq } from 'drizzle-orm';

import { orchestrationWorkflows } from '../schemas/orchestrationWorkflow';
import { orchestrationWorkflowEvents } from '../schemas/orchestrationWorkflowGraph';
import type { OrviloDatabase } from '../type';
import { buildWorkspaceWhere } from '../utils/workspace';
import { OrchestrationWorkflowGraphModel } from './orchestrationWorkflowGraph';

/** Ignore only coordinator bookkeeping; edits to policy, evidence or graph invalidate a plan. */
export const orchestrationWorkflowExplorationSnapshot = (
  graph: OrchestrationWorkflowGraphSnapshot,
): string => {
  const { checkpoint: _checkpoint, ...policy } =
    graph.orchestrationWorkflow.config?.exploration ?? {};
  return createHash('sha256')
    .update(
      JSON.stringify({
        orchestrationWorkflow: {
          ...graph.orchestrationWorkflow,
          updatedAt: undefined,
          config: { ...graph.orchestrationWorkflow.config, exploration: policy },
        },
        nodes: [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)),
        edges: [...graph.edges].sort((a, b) => a.id.localeCompare(b.id)),
        decisions: graph.decisions,
        versions: graph.workVersions
          .map(({ nodeId, workVersionId, relation }) => ({ nodeId, workVersionId, relation }))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      }),
    )
    .digest('hex');
};

/** Lease the model call, then commit its graph patch atomically after checking its input. */
export class OrchestrationWorkflowExplorationModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly userId: string,
    private readonly workspaceId?: string,
  ) {}

  private async lock(tx: OrviloDatabase, orchestrationWorkflowId: string) {
    const [orchestrationWorkflow] = await tx
      .select()
      .from(orchestrationWorkflows)
      .where(
        and(
          eq(orchestrationWorkflows.id, orchestrationWorkflowId),
          buildWorkspaceWhere(
            { userId: this.userId, workspaceId: this.workspaceId },
            orchestrationWorkflows,
          ),
        ),
      )
      .for('update');
    return orchestrationWorkflow;
  }

  private graph(tx: OrviloDatabase) {
    return new OrchestrationWorkflowGraphModel(tx, this.userId, this.workspaceId, {
      id: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
      type: 'system',
    });
  }

  private async recordDecision(
    tx: OrviloDatabase,
    orchestrationWorkflowId: string,
    reason: string,
  ) {
    await tx.insert(orchestrationWorkflowEvents).values({
      actorId: ORCHESTRATION_WORKFLOW_COORDINATOR_ACTOR_ID,
      actorType: 'system',
      entityId: orchestrationWorkflowId,
      entityType: 'orchestrationWorkflow',
      eventType: 'updated',
      orchestrationWorkflowId,
      reason,
    });
  }

  async claim(orchestrationWorkflowId: string, expectedSnapshot: string) {
    return this.db.transaction(async (transaction) => {
      const tx = transaction as unknown as OrviloDatabase;
      const orchestrationWorkflow = await this.lock(tx, orchestrationWorkflowId);
      if (
        !orchestrationWorkflow ||
        orchestrationWorkflow.status !== 'running' ||
        !orchestrationWorkflow.config?.exploration
      )
        return;
      const previous = orchestrationWorkflow.config.exploration.checkpoint;
      if (previous && !previous.readyForAcceptance && Date.parse(previous.expiresAt) > Date.now())
        return;
      const graph = await this.graph(tx).getGraph(orchestrationWorkflowId);
      if (!graph || orchestrationWorkflowExplorationSnapshot(graph) !== expectedSnapshot) return;
      const checkpoint = {
        token: randomUUID(),
        snapshot: expectedSnapshot,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      };
      await tx
        .update(orchestrationWorkflows)
        .set({
          config: {
            ...orchestrationWorkflow.config,
            exploration: { ...orchestrationWorkflow.config.exploration, checkpoint },
          },
        })
        .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
      return checkpoint;
    });
  }

  async apply(
    orchestrationWorkflowId: string,
    token: string,
    decision: OrchestrationWorkflowExplorationDecision,
  ) {
    return this.db.transaction(async (transaction) => {
      const tx = transaction as unknown as OrviloDatabase;
      const orchestrationWorkflow = await this.lock(tx, orchestrationWorkflowId);
      const policy = orchestrationWorkflow?.config?.exploration;
      const checkpoint = policy?.checkpoint;
      if (
        !orchestrationWorkflow ||
        orchestrationWorkflow.status !== 'running' ||
        !policy ||
        checkpoint?.token !== token ||
        checkpoint.readyForAcceptance
      )
        return { outcome: 'stale' as const };
      const graphModel = this.graph(tx);
      const graph = await graphModel.getGraph(orchestrationWorkflowId);
      if (!graph || orchestrationWorkflowExplorationSnapshot(graph) !== checkpoint.snapshot) {
        await tx
          .update(orchestrationWorkflows)
          .set({
            config: {
              ...orchestrationWorkflow.config,
              exploration: { ...policy, checkpoint: undefined },
            },
          })
          .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
        return { outcome: 'stale' as const };
      }
      const experiments = graph.nodes.filter(
        (node) =>
          node.kind === 'experiment' ||
          // A standalone correction re-runs an existing question, so it must not
          // read back as a new experiment: that would spend a slot and let the
          // planner revise it as a fresh target with an empty correction budget.
          (node.kind === 'task' &&
            node.title !== ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE &&
            !experimentOwner(graph, node.id) &&
            !isProtocolRevision(graph, node.id)),
      );
      if (decision.action === 'verify') {
        await tx
          .update(orchestrationWorkflows)
          .set({
            config: {
              ...orchestrationWorkflow.config,
              exploration: {
                ...policy,
                checkpoint: {
                  ...checkpoint,
                  readyForAcceptance: true,
                  reviewedNodeIds: graph.nodes
                    .filter((node) => node.kind === 'task')
                    .map((node) => node.id),
                },
              },
            },
          })
          .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
        await this.recordDecision(
          tx,
          orchestrationWorkflowId,
          `Exploration requests final acceptance: ${decision.reason}`,
        );
        return { outcome: 'verify' as const };
      }
      if (decision.action === 'revise') {
        const target = experiments.find(
          (node) => node.id === decision.parentNodeId && node.status === 'resolved',
        );
        if (!target)
          throw new Error(
            'A revision must correct a resolved experiment in this orchestration workflow',
          );
        // A spent allowance is a predictable policy answer, not a planner crash. Throwing
        // here would pause the whole orchestration workflow through the generic failure path, and resuming
        // could produce the same choice again.
        const spent = protocolRevisionCount(graph, target.id);
        if (spent >= MAX_PROTOCOL_REVISIONS) {
          // The planner asked for a correction after being told the allowance was
          // gone, and nothing about the graph will change on its own. Leaving the
          // orchestration workflow running would let every sweep buy another identical planning call
          // forever, so park it the way an exhausted experiment budget does.
          const reason = `Experiment ${target.id} already ran ${spent} corrected protocols; the planner asked for another. Resume to replan.`;
          await tx
            .update(orchestrationWorkflows)
            .set({
              config: {
                ...orchestrationWorkflow.config,
                exploration: { ...policy, checkpoint: undefined },
                pausedBy: 'exploration_revision_limit',
              },
              status: 'paused',
            })
            .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
          await graphModel.recordOrchestrationWorkflowStatus(
            orchestrationWorkflowId,
            'running',
            'paused',
            reason,
          );
          return { outcome: 'revision-limit' as const, reason };
        }
        // Correcting an instrument reuses the parent's container, so the graph keeps one
        // question with successive protocols instead of a row of flawed siblings. An
        // uncontained legacy seed has no such container: a correction there would be
        // another root task, which the planner cannot see, which drops the previous
        // correction's Work, and which an older release would read back as an
        // experiment consuming a slot. Those orchestration workflows expand first.
        const container =
          target.kind === 'experiment' ? target.id : experimentOwner(graph, target.id);
        if (!container)
          throw new Error('A revision needs an experiment container; expand this seed first');
        const node = await graphModel.createNode(orchestrationWorkflowId, {
          description: decision.instruction,
          kind: 'task',
          scopeId: container,
          title: decision.title.trim() || target.title,
        });
        if (!node) throw new Error('Could not persist the revised protocol');
        await graphModel.createEdge(orchestrationWorkflowId, node.id, target.id, 'revises');
        const members = experimentScope(graph, container);
        for (const version of graph.workVersions.filter(
          (item) => members.has(item.nodeId) && item.relation === 'produced',
        ))
          // Preserve the existing version visibility checks; never turn a graph link into read permission.
          await graphModel.attachWorkVersion(
            orchestrationWorkflowId,
            node.id,
            version.workVersionId,
            'input',
          );
        await tx
          .update(orchestrationWorkflows)
          .set({
            config: {
              ...orchestrationWorkflow.config,
              exploration: { ...policy, checkpoint: undefined },
            },
          })
          .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
        await this.recordDecision(
          tx,
          orchestrationWorkflowId,
          `Revised ${target.id}: ${decision.reason}`,
        );
        return { outcome: 'revised' as const, nodeId: node.id, parentNodeId: target.id };
      }
      if (experiments.length >= policy.maxExperiments) {
        await tx
          .update(orchestrationWorkflows)
          .set({
            status: 'paused',
            config: {
              ...orchestrationWorkflow.config,
              pausedBy: 'exploration_limit',
              exploration: { ...policy, checkpoint: undefined },
            },
          })
          .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
        await graphModel.recordOrchestrationWorkflowStatus(
          orchestrationWorkflowId,
          'running',
          'paused',
          `Experiment limit reached (${experiments.length}/${policy.maxExperiments}); orchestration workflow is not yet accepted. ${decision.reason}`,
        );
        return { outcome: 'limit' as const };
      }
      const parent = experiments.find(
        (node) => node.id === decision.parentNodeId && node.status === 'resolved',
      );
      if (!parent)
        throw new Error(
          'Exploration must derive from a resolved experiment in this orchestration workflow',
        );
      const questionId =
        graph.edges.find((edge) => edge.kind === 'answers' && edge.sourceNodeId === parent.id)
          ?.targetNodeId ??
        graph.nodes.find((item) => item.kind === 'problem' && !experimentOwner(graph, item.id))?.id;
      if (!questionId) throw new Error('Exploration requires a question');
      const experiment = await graphModel.createNode(orchestrationWorkflowId, {
        kind: 'experiment',
        title: decision.title,
        description: decision.instruction,
        questionId,
        scopeId: experimentOwner(graph, questionId),
      });
      if (!experiment) throw new Error('Could not create experiment');
      const node = await graphModel.createNode(orchestrationWorkflowId, {
        scopeId: experiment.id,
        kind: 'task',
        title: decision.title,
        description: decision.instruction,
      });
      if (!node) throw new Error('Could not persist exploration node');
      await graphModel.createEdge(
        orchestrationWorkflowId,
        experiment.id,
        parent.id,
        'derived_from',
      );
      const parentMembers = experimentScope(graph, parent.id);
      for (const version of graph.workVersions.filter(
        (item) => parentMembers.has(item.nodeId) && item.relation === 'produced',
      )) {
        // Preserve the existing version visibility checks; never turn a graph link into read permission.
        await graphModel.attachWorkVersion(
          orchestrationWorkflowId,
          node.id,
          version.workVersionId,
          'input',
        );
        await graphModel.attachWorkVersion(
          orchestrationWorkflowId,
          experiment.id,
          version.workVersionId,
          'input',
        );
      }
      await tx
        .update(orchestrationWorkflows)
        .set({
          config: {
            ...orchestrationWorkflow.config,
            exploration: { ...policy, checkpoint: undefined },
          },
        })
        .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
      await this.recordDecision(
        tx,
        orchestrationWorkflowId,
        `Expanded from ${parent.id}: ${decision.reason}`,
      );
      return { outcome: 'expanded' as const, nodeId: experiment.id, parentNodeId: parent.id };
    });
  }

  /** Only the owner of this still-current lease may park a failed planner. */
  async fail(orchestrationWorkflowId: string, token: string, reason: string) {
    return this.db.transaction(async (transaction) => {
      const tx = transaction as unknown as OrviloDatabase;
      const orchestrationWorkflow = await this.lock(tx, orchestrationWorkflowId);
      if (
        !orchestrationWorkflow ||
        orchestrationWorkflow.status !== 'running' ||
        orchestrationWorkflow.config?.exploration?.checkpoint?.token !== token
      )
        return;
      await tx
        .update(orchestrationWorkflows)
        .set({
          status: 'paused',
          config: {
            ...orchestrationWorkflow.config,
            exploration: { ...orchestrationWorkflow.config.exploration, checkpoint: undefined },
          },
        })
        .where(eq(orchestrationWorkflows.id, orchestrationWorkflowId));
      await this.graph(tx).recordOrchestrationWorkflowStatus(
        orchestrationWorkflowId,
        'running',
        'paused',
        reason,
      );
    });
  }
}
