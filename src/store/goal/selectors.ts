import type { GoalStore } from './action';

const EMPTY_GOALS: GoalStore['goalListByAgentId'][string] = [];

const goalGraph = (orchestrationWorkflowId?: string | null) => (s: GoalStore) =>
  orchestrationWorkflowId ? s.goalGraphById[orchestrationWorkflowId] : undefined;

const goalMetricSeries = (orchestrationWorkflowId?: string | null) => (s: GoalStore) =>
  orchestrationWorkflowId ? s.goalMetricSeriesById[orchestrationWorkflowId] : undefined;

const goalList = (agentId: string) => (s: GoalStore) => s.goalListByAgentId[agentId] ?? EMPTY_GOALS;

const isGoalListInitialized = (agentId: string) => (s: GoalStore) =>
  s.goalListInitializedAgentIds.includes(agentId);

const homeGoals = (scope: string) => (s: GoalStore) => s.homeGoalsByScope[scope] ?? EMPTY_GOALS;

const isHomeGoalsInitialized = (scope: string) => (s: GoalStore) =>
  s.homeGoalsInitializedScopes.includes(scope);

export const goalSelectors = {
  goalMetricSeries,
  goalGraph,
  goalList,
  homeGoals,
  isGoalListInitialized,
  isHomeGoalsInitialized,
};
