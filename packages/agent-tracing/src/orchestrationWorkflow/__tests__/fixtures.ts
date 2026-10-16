import type {
  OrchestrationWorkflowGraphState,
  OrchestrationWorkflowTraceEdge,
  OrchestrationWorkflowTraceNode,
} from '../types';

export const node = (
  id: string,
  overrides: Partial<OrchestrationWorkflowTraceNode> = {},
): OrchestrationWorkflowTraceNode => ({
  createdAt: 1000,
  id,
  kind: 'task',
  priority: 0,
  status: 'proposed',
  title: id,
  ...overrides,
});

export const edge = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  kind = 'depends_on',
): OrchestrationWorkflowTraceEdge => ({ id, kind, sourceNodeId, targetNodeId });

export const graph = (
  overrides: Partial<OrchestrationWorkflowGraphState> = {},
): OrchestrationWorkflowGraphState => ({
  decisions: [],
  edges: [],
  orchestrationWorkflow: {
    id: 'orchestration_workflow_1',
    maxRounds: null,
    maxTotalCost: null,
    status: 'running',
    title: 'Reproduce nanoGPT',
  },
  nodes: [],
  ...overrides,
});
