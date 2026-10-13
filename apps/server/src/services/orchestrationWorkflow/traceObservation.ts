import type {
  FrontierCandidate,
  OrchestrationWorkflowAdvanceEffect,
  OrchestrationWorkflowBudgetState,
  OrchestrationWorkflowFrontierTaskState,
  OrchestrationWorkflowGraphState,
  OrchestrationWorkflowMetricCriteriaState,
  OrchestrationWorkflowTickBranch,
  OrchestrationWorkflowTickOutcome,
} from '@orvilo/agent-tracing';
import type {
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowItem,
  TaskItem,
} from '@orvilo/types';

/**
 * What one tick read and what it did, handed to the trajectory recorder.
 *
 * Travels through a side channel rather than on `OrchestrationWorkflowTickResult` because the
 * graph payload is large and that result crosses tRPC to the client — the same
 * reason the context engine snapshot stays off the agent runtime's event array.
 */
export interface OrchestrationWorkflowTickObservation {
  at: number;
  branch: OrchestrationWorkflowTickBranch;
  budget?: OrchestrationWorkflowBudgetState;
  candidates: FrontierCandidate[];
  candidateTasks?: OrchestrationWorkflowFrontierTaskState[];
  chosenNodeId?: string;
  concurrency?: number;
  effects: OrchestrationWorkflowAdvanceEffect[];
  graphState: OrchestrationWorkflowGraphState;
  message: string;
  /** Numeric acceptance clauses as they read, on terminal-phase decisions. */
  metricCriteria?: OrchestrationWorkflowMetricCriteriaState;
  outcome: OrchestrationWorkflowTickOutcome;
  taskId?: string;
}

export interface OrchestrationWorkflowTickOptions {
  onDecision?: (observation: OrchestrationWorkflowTickObservation) => void;
}

/**
 * Project the server graph onto the trace format.
 *
 * Only what the coordinator actually reads is carried over: descriptions,
 * confidences and event history are not decision inputs, and a trajectory that
 * copied them would grow with the conversation rather than with the reasoning.
 */
export const toTraceGraphState = (
  graph: OrchestrationWorkflowGraphSnapshot,
): OrchestrationWorkflowGraphState => ({
  decisions: graph.decisions.map((decision) => ({
    id: decision.id,
    nodeId: decision.nodeId,
    question: decision.question,
    resolvedOptionId: decision.resolvedOptionId,
    status: decision.status,
  })),
  edges: graph.edges.map((edge) => ({
    id: edge.id,
    kind: edge.kind,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
  })),
  orchestrationWorkflow: {
    agentId: graph.orchestrationWorkflow.agentId,
    exploration: graph.orchestrationWorkflow.config?.exploration,
    id: graph.orchestrationWorkflow.id,
    maxRounds: graph.orchestrationWorkflow.maxRounds,
    maxTotalCost: graph.orchestrationWorkflow.maxTotalCost,
    requirement: graph.orchestrationWorkflow.requirement,
    status: graph.orchestrationWorkflow.status,
    title: graph.orchestrationWorkflow.title,
  },
  nodes: graph.nodes.map((node) => ({
    createdAt: node.createdAt.getTime(),
    id: node.id,
    kind: node.kind,
    priority: node.priority,
    status: node.status,
    taskId: node.taskId,
    title: node.title,
  })),
});

export const toFrontierTaskState = (
  task: TaskItem,
  nodeId?: string,
  status?: string,
): OrchestrationWorkflowFrontierTaskState => ({
  error: task.error,
  id: task.id,
  identifier: task.identifier,
  nodeId,
  status: status ?? task.status,
  updatedAt: new Date(task.updatedAt).getTime(),
});

export interface BudgetEvaluation {
  costLimitReached: boolean;
  /** ISO deadline from the orchestration workflow's schedule config; null = uncapped. */
  deadline: string | null;
  deadlinePassed: boolean;
  roundLimitReached: boolean;
  /** Runs the graph's Task nodes produced — the round count. */
  runs: number;
  totalCost: number;
}

export const toBudgetState = (
  orchestrationWorkflow: OrchestrationWorkflowItem,
  budget: BudgetEvaluation,
): OrchestrationWorkflowBudgetState => ({
  costLimitReached: budget.costLimitReached,
  deadlinePassed: budget.deadlinePassed,
  maxRounds: orchestrationWorkflow.maxRounds,
  maxTotalCost:
    orchestrationWorkflow.maxTotalCost === null ? null : Number(orchestrationWorkflow.maxTotalCost),
  roundLimitReached: budget.roundLimitReached,
  runs: budget.runs,
  totalCost: budget.totalCost,
});
