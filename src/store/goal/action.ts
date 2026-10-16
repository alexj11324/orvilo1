import { type GoalStatus, goalStatuses } from '@orvilo/const/goal';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { goalKeys, taskKeys } from '@/libs/swr/keys';
import { goalService } from '@/services/goal';
import { metricService } from '@/services/metric';
import type { StoreSetter } from '@/store/types';

import type { GoalListFilter, GoalState, GoalViewMode } from './initialState';

const GOAL_STATUSES: GoalStatus[] = [...goalStatuses];

/**
 * The home roll-up only ever renders goals that are still open, so it asks for
 * the statuses one can be open in and leaves the terminal ones on the server.
 * `completed` is in because a completed goal is awaiting acceptance until the
 * user accepts it.
 *
 * The limit still bites in a workspace with more than this many such goals —
 * `groupList` takes the newest, and accepted goals stay `completed` — so the
 * tail of a very long history can crowd out an old still-running goal. Fixing
 * that for real needs an acceptance join on the server; this keeps the window
 * as wide as the query allows in the meantime.
 */
// The home roll-up only renders goals that are still open: terminal states
// (achieved / canceled) stay on the server, `review` is included because a
// converged goal is still awaiting the user's sign-off.
const HOME_GOAL_STATUSES: GoalStatus[] = ['planning', 'running', 'verifying', 'review'];
const HOME_GOAL_FETCH_LIMIT = 100;

/**
 * Statuses in which the *server* is the one making progress. A goal now
 * advances from server events, so nothing tells an open page to re-read: the
 * frontier, activity and findings would sit frozen — a spinner still turning
 * on a goal that already finished — until the tab lost and regained focus.
 *
 * `review` and `paused` are deliberately out: those wait on a person, and the
 * action that moves them refreshes the snapshot itself.
 */
const SERVER_ADVANCING_STATUSES = new Set<GoalStatus>(['planning', 'running', 'verifying']);

/** Kept coarse on purpose — this is liveness, not a progress bar. */
const GOAL_GRAPH_POLL_INTERVAL = 5000;

export type GoalStore = GoalState & GoalAction;
type Setter = StoreSetter<GoalStore>;

export class GoalActionImpl {
  readonly #get: () => GoalStore;
  readonly #set: Setter;

  constructor(set: Setter, get: () => GoalStore, _api?: unknown) {
    void _api;
    this.#get = get;
    this.#set = set;
  }

  refreshGoalGraph = async (goalId: string): Promise<void> => {
    await mutate(goalKeys.graph(goalId));
  };

  /** The Goal Graph snapshot behind the process-control surface. */
  useFetchGoalGraph = (goalId?: string | null) =>
    useClientDataSWR(goalId ? goalKeys.graph(goalId) : null, () => goalService.getGraph(goalId!), {
      onSuccess: (graph) => {
        this.#set(
          ({ goalGraphById }) => ({ goalGraphById: { ...goalGraphById, [goalId!]: graph } }),
          false,
          'useFetchGoalGraph/success',
        );
      },
      refreshInterval: (graph) =>
        graph && SERVER_ADVANCING_STATUSES.has(graph.goal.status) ? GOAL_GRAPH_POLL_INTERVAL : 0,
      revalidateOnFocus: true,
    });

  /**
   * North-star data of the goal detail header. Polls on the same cadence logic
   * as the graph: while the server is advancing, a probe Work or an agent
   * `recordObservation` can land a fresh point at any time.
   */
  useFetchGoalMetricSeries = (goalId?: string | null) =>
    useClientDataSWR(
      goalId ? goalKeys.metricSeries(goalId) : null,
      // Only the declared keys are fetched — the same goal can accumulate any
      // number of other sampled series, and none of them can affect this view.
      // Keys are read at fetch time; the declare path revalidates this cache
      // key right after refreshing the graph, so a newly declared clause is
      // fetched against fresh criteria.
      () =>
        metricService.listSeriesWithPoints(
          'goal',
          goalId!,
          (this.#get().goalGraphById[goalId!]?.goal.config?.acceptance?.metrics ?? []).map(
            (criterion) => criterion.key,
          ),
        ),
      {
        onSuccess: (series) => {
          this.#set(
            ({ goalMetricSeriesById }) => ({
              goalMetricSeriesById: { ...goalMetricSeriesById, [goalId!]: series },
            }),
            false,
            'useFetchGoalMetricSeries/success',
          );
        },
        refreshInterval: () => {
          const graph = this.#get().goalGraphById[goalId!];
          return graph && SERVER_ADVANCING_STATUSES.has(graph.goal.status)
            ? GOAL_GRAPH_POLL_INTERVAL
            : 0;
        },
        revalidateOnFocus: true,
      },
    );

  refreshGoalMetricSeries = async (goalId: string): Promise<void> => {
    await mutate(goalKeys.metricSeries(goalId));
  };

  loadMoreGoals = (): void => {
    this.#set(
      ({ goalListVisibleLimit }) => ({ goalListVisibleLimit: goalListVisibleLimit + 10 }),
      false,
      'loadMoreGoals',
    );
  };

  refreshGoals = async (scopeId: string): Promise<void> => {
    await mutate(taskKeys.sidebarGroups(`${scopeId}:goals-page`));
  };

  refreshHomeGoals = async (scope: string): Promise<void> => {
    await mutate(taskKeys.homeGoals(scope));
  };

  setGoalListFilter = (filter: GoalListFilter): void => {
    this.#set({ goalListFilter: filter, goalListVisibleLimit: 10 }, false, 'setGoalListFilter');
  };

  setGoalViewMode = (mode: GoalViewMode): void => {
    this.#set({ goalViewMode: mode }, false, 'setGoalViewMode');
  };

  useFetchGoals = (agentId?: string, projectId?: string) => {
    const scopeId = projectId ? `project:${projectId}` : agentId;

    return useClientDataSWR(
      scopeId ? taskKeys.sidebarGroups(`${scopeId}:goals-page`) : null,
      () =>
        goalService.list({
          agentId,
          limit: 100,
          projectId,
          statuses: GOAL_STATUSES,
        }),
      {
        onSuccess: ({ goals }) => {
          this.#set(
            ({ goalListByAgentId, goalListInitializedAgentIds }) => ({
              goalListByAgentId: {
                ...goalListByAgentId,
                [scopeId!]: goals,
              },
              goalListInitializedAgentIds: goalListInitializedAgentIds.includes(scopeId!)
                ? goalListInitializedAgentIds
                : [...goalListInitializedAgentIds, scopeId!],
            }),
            false,
            'useFetchGoals/success',
          );
        },
        revalidateOnFocus: true,
      },
    );
  };

  /**
   * Every agent's goals in one read — the home rail is a cross-agent roll-up,
   * so it cannot go through the per-agent list. Same server query minus the
   * assignee filter; the rail buckets and truncates client-side.
   */
  useFetchHomeGoals = (enabled: boolean, scope: string) =>
    useClientDataSWR(
      enabled ? taskKeys.homeGoals(scope) : null,
      () =>
        goalService.list({
          limit: HOME_GOAL_FETCH_LIMIT,
          statuses: HOME_GOAL_STATUSES,
        }),
      {
        onSuccess: ({ goals }) => {
          this.#set(
            ({ homeGoalsByScope, homeGoalsInitializedScopes }) => ({
              homeGoalsByScope: { ...homeGoalsByScope, [scope]: goals },
              homeGoalsInitializedScopes: homeGoalsInitializedScopes.includes(scope)
                ? homeGoalsInitializedScopes
                : [...homeGoalsInitializedScopes, scope],
            }),
            false,
            'useFetchHomeGoals/success',
          );
        },
        revalidateOnFocus: true,
      },
    );
}

export type GoalAction = Pick<GoalActionImpl, keyof GoalActionImpl>;
