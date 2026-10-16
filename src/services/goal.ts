import type { OrchestrationWorkflowStatus } from '@orvilo/const/orchestrationWorkflow';
import type {
  OrchestrationWorkflowCreateConfig,
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowMetricCriterion,
  OrchestrationWorkflowNodeKind,
  OrchestrationWorkflowTickResult,
} from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

export interface GoalListParams {
  agentId?: string;
  limit?: number;
  offset?: number;
  projectId?: string;
  statuses?: OrchestrationWorkflowStatus[];
}

/** Every graph method takes the `goals` row id. */
class OrchestrationWorkflowService {
  /**
   * List goals. Each item is the execution-carrier task with the goal row
   * attached plus subtree run statistics — see `GoalModel.list` on the server.
   */
  list = async (params: GoalListParams) => lambdaClient.orchestrationWorkflow.list.query(params);

  /** Create a goal and seed its graph with a problem node and the given Work. */
  create = async (params: {
    agentId?: string;
    config?: OrchestrationWorkflowCreateConfig;
    /** Set by the `/goal` tool so the seeded graph is authored by the agent. */
    createdByAgentId?: string;
    /** Structured acceptance criteria — persisted rows that gate the terminal acceptance. */
    criteria?: Array<{ description?: string; instruction?: string; title: string }>;
    maxRounds?: number;
    maxTotalCost?: number;
    /** The user's ask in their own words — shown on the seeded problem node. */
    problemDescription?: string;
    projectId?: string;
    requirement?: string;
    title: string;
    work?: Array<{ description?: string; title: string } | string>;
  }): Promise<OrchestrationWorkflowGraphSnapshot> => {
    const { data } = await lambdaClient.orchestrationWorkflow.create.mutate(params);
    return data;
  };

  /** Rebind which persisted verify criteria gate this goal's terminal acceptance. */
  setAcceptanceCriteria = async (id: string, criteriaIds: string[]) =>
    lambdaClient.orchestrationWorkflow.setAcceptanceCriteria.mutate({ criteriaIds, id });

  setMetricCriteria = async (
    id: string,
    metrics: OrchestrationWorkflowMetricCriterion[],
    mode?: 'merge' | 'replace',
  ) => lambdaClient.orchestrationWorkflow.setMetricCriteria.mutate({ id, metrics, mode });

  recordObservation = async (
    id: string,
    observation: { key: string; observedAt?: Date; title?: string; unit?: string; value: number },
  ) => lambdaClient.orchestrationWorkflow.recordObservation.mutate({ id, ...observation });

  /** Delete a goal and its graph. The dispatched Work Tasks are left in place. */
  delete = async (id: string) => lambdaClient.orchestrationWorkflow.delete.mutate({ id });

  /** The whole Goal Graph in one read: nodes, edges, decisions, events, work-version links. */
  getGraph = async (id: string): Promise<OrchestrationWorkflowGraphSnapshot> => {
    const { data } = await lambdaClient.orchestrationWorkflow.graph.query({ id });
    return data;
  };

  /**
   * Run the coordinator now and report where it stopped. The goal also advances
   * on its own as its Work Tasks settle — this is the explicit nudge, not the
   * engine, so the surface never has to hold a tick loop open.
   */
  advance = async (id: string): Promise<OrchestrationWorkflowTickResult & { ticks: number }> => {
    const { data } = await lambdaClient.orchestrationWorkflow.advance.mutate({ id });
    return data;
  };

  /** Advance the graph by exactly one coordinator step. */
  tick = async (id: string): Promise<OrchestrationWorkflowTickResult> => {
    const { data } = await lambdaClient.orchestrationWorkflow.tick.mutate({ id });
    return data;
  };

  /** Stop scheduling new work. Does not abort the operation already running. */
  pause = async (id: string) => lambdaClient.orchestrationWorkflow.pause.mutate({ id });

  resume = async (id: string) => lambdaClient.orchestrationWorkflow.resume.mutate({ id });

  /** Resolve a pending decision gate. Does not resume a paused goal by itself. */
  decide = async (params: {
    decisionId: string;
    id: string;
    optionId: string;
    resolution?: string;
  }) => lambdaClient.orchestrationWorkflow.decide.mutate(params);

  setBudget = async (params: {
    deadline?: string | null;
    id: string;
    maxConcurrentTasks?: number | null;
    maxRounds?: number | null;
    maxTotalCost?: number | null;
  }) => lambdaClient.orchestrationWorkflow.setBudget.mutate(params);

  addNode = async (params: {
    description?: string;
    id: string;
    kind: OrchestrationWorkflowNodeKind;
    priority?: number;
    title: string;
  }) => lambdaClient.orchestrationWorkflow.addNode.mutate(params);

  updateRequirement = async (id: string, requirement: string) =>
    lambdaClient.orchestrationWorkflow.updateRequirement.mutate({ id, requirement });
}

export const orchestrationWorkflowService = new OrchestrationWorkflowService();

export type GoalListResult = Awaited<ReturnType<OrchestrationWorkflowService['list']>>;
export type OrchestrationWorkflowListItem = GoalListResult['orchestrationWorkflows'][number];
