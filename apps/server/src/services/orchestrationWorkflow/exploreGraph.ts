import type { OrchestrationWorkflowAdvanceEffect } from '@orvilo/agent-tracing';
import { ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE } from '@orvilo/const/orchestrationWorkflow';
import type {
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowTickResult,
} from '@orvilo/types';
import {
  experimentOwner,
  experimentScope,
  isProtocolRevision,
  MAX_PROTOCOL_REVISIONS,
  protocolRevisionCount,
} from '@orvilo/utils/orchestrationWorkflowGraph';

import {
  OrchestrationWorkflowExplorationModel,
  orchestrationWorkflowExplorationSnapshot,
} from '@/database/models/orchestrationWorkflowExploration';
import type { OrviloDatabase } from '@/database/type';

import { OrchestrationWorkflowExplorationPlanner } from './explorationPlanner';

export const experimentResults = (
  graph: OrchestrationWorkflowGraphSnapshot,
  nodeId: string,
): string[] => {
  const members = experimentScope(graph, nodeId);
  const findings = new Set(
    graph.edges
      .filter((edge) => members.has(edge.sourceNodeId) && edge.kind === 'produces')
      .map((edge) => edge.targetNodeId),
  );
  return graph.nodes
    .filter((node) => findings.has(node.id) && node.kind === 'finding')
    .map((node) => `${node.title}\n${node.description ?? ''}`.slice(0, 12000));
};

export async function exploreGraph(params: {
  db: OrviloDatabase;
  userId: string;
  workspaceId?: string;
  graph: OrchestrationWorkflowGraphSnapshot;
  effects: OrchestrationWorkflowAdvanceEffect[];
}): Promise<OrchestrationWorkflowTickResult> {
  const { db, userId, workspaceId, graph, effects } = params;
  const orchestrationWorkflowId = graph.orchestrationWorkflow.id;
  const policy = graph.orchestrationWorkflow.config!.exploration!;
  const model = new OrchestrationWorkflowExplorationModel(db, userId, workspaceId);
  const claim = await model.claim(
    orchestrationWorkflowId,
    orchestrationWorkflowExplorationSnapshot(graph),
  );
  if (!claim)
    return {
      orchestrationWorkflowId,
      outcome: 'waiting_external',
      message: 'Graph changed or another advance is already exploring',
    };
  try {
    const decision = await new OrchestrationWorkflowExplorationPlanner(
      db,
      userId,
      workspaceId,
    ).plan(
      {
        requirement: graph.orchestrationWorkflow.requirement ?? graph.orchestrationWorkflow.title,
        instruction: policy.instruction,
        maxExperiments: policy.maxExperiments,
        experiments: graph.nodes
          .filter(
            (node) =>
              node.kind === 'experiment' ||
              (node.kind === 'task' &&
                node.title !== ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE &&
                !experimentOwner(graph, node.id) &&
                !isProtocolRevision(graph, node.id)),
          )
          .map((node) => ({
            id: node.id,
            title: node.title,
            status: node.status,
            results: experimentResults(graph, node.id),
            // Tells the planner which experiments a previous turn authored, so it can
            // judge whether its own last move helped before repeating that direction.
            derivedFromId: graph.edges.find(
              (edge) => edge.sourceNodeId === node.id && edge.kind === 'derived_from',
            )?.targetNodeId,
            // An uncontained seed cannot hold a correction, so it reports none left
            // rather than inviting a choice the apply step would refuse.
            revisionsRemaining:
              node.kind === 'experiment' || experimentOwner(graph, node.id)
                ? Math.max(MAX_PROTOCOL_REVISIONS - protocolRevisionCount(graph, node.id), 0)
                : 0,
            inputVersionIds: graph.workVersions
              .filter(
                (version) =>
                  experimentScope(graph, node.id).has(version.nodeId) &&
                  version.relation === 'produced' &&
                  version.work,
              )
              .map((version) => version.workVersionId),
          })),
      },
      // The orchestration workflow's coordinator agent is the authorized binding for this plan.
      { agentId: graph.orchestrationWorkflow.agentId },
    );
    const result = await model.apply(orchestrationWorkflowId, claim.token, decision);
    if (result.outcome === 'stale')
      return {
        orchestrationWorkflowId,
        outcome: 'advanced',
        message: 'Exploration input changed; re-read the graph',
      };
    if (result.outcome === 'limit') {
      effects.push({ type: 'orchestration_workflow_status', detail: 'paused: experiment limit' });
      return {
        orchestrationWorkflowId,
        outcome: 'no_progress',
        message: `Experiment limit reached (${policy.maxExperiments}); orchestration workflow is not yet accepted. ${decision.reason}`,
      };
    }
    if (result.outcome === 'revision-limit') {
      effects.push({
        detail: 'paused: revision allowance spent',
        type: 'orchestration_workflow_status',
      });
      return { orchestrationWorkflowId, outcome: 'no_progress', message: result.reason };
    }
    if (result.outcome === 'revised') {
      effects.push({
        type: 'created_node',
        nodeId: result.nodeId,
        detail: `revised ${result.parentNodeId}: ${decision.reason}`,
      });
      return {
        orchestrationWorkflowId,
        nodeId: result.nodeId,
        outcome: 'advanced',
        message: decision.reason,
      };
    }
    if (result.outcome === 'expanded') {
      effects.push({
        type: 'created_node',
        nodeId: result.nodeId,
        detail: `derived_from ${result.parentNodeId}: ${decision.reason}`,
      });
      return {
        orchestrationWorkflowId,
        nodeId: result.nodeId,
        outcome: 'advanced',
        message: decision.reason,
      };
    }
    return {
      orchestrationWorkflowId,
      outcome: 'advanced',
      message: `Exploration requests final acceptance: ${decision.reason}`,
    };
  } catch (error) {
    console.error('[orchestration workflow/exploration] planning failed:', error);
    await model.fail(
      orchestrationWorkflowId,
      claim.token,
      'Exploration planning failed; resume to retry.',
    );
    return {
      orchestrationWorkflowId,
      outcome: 'no_progress',
      message: 'Exploration planning failed; orchestration workflow paused. Resume to retry.',
    };
  }
}
