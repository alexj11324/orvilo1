import type { GoalStatus } from '@orvilo/const/goal';
import type { GoalGraphSnapshot } from '@orvilo/types';

import { lambdaClient } from '@/libs/trpc/client';

export interface GoalListParams {
  agentId?: string;
  limit?: number;
  offset?: number;
  projectId?: string;
  statuses?: GoalStatus[];
}

/** Every graph method takes the `goals` row id. */
class GoalService {
  /**
   * List goals. Each item is the execution-carrier task with the goal row
   * attached plus subtree run statistics — see `GoalModel.list` on the server.
   */
  list = async (params: GoalListParams) => lambdaClient.goal.list.query(params);

  /** The whole Goal Graph in one read: nodes, edges, decisions, events, work-version links. */
  getGraph = async (id: string): Promise<GoalGraphSnapshot> => {
    const { data } = await lambdaClient.goal.graph.query({ id });
    return data;
  };
}

export const goalService = new GoalService();

export type GoalListResult = Awaited<ReturnType<GoalService['list']>>;
export type GoalListItem = GoalListResult['goals'][number];
