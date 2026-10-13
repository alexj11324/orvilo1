import {
  type OrchestrationWorkflowStatus,
  orchestrationWorkflowStatuses,
} from '@orvilo/const/orchestrationWorkflow';
import type {
  OrchestrationWorkflowMetricCriterion,
  OrchestrationWorkflowTickResult,
} from '@orvilo/types';

import { mutate, useClientDataSWR } from '@/libs/swr';
import { goalKeys, taskKeys } from '@/libs/swr/keys';
import { orchestrationWorkflowService } from '@/services/goal';
import { metricService } from '@/services/metric';
import type { StoreSetter } from '@/store/types';

import type { GoalListFilter, GoalState, GoalViewMode } from './initialState';

const GOAL_STATUSES: OrchestrationWorkflowStatus[] = [...orchestrationWorkflowStatuses];

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
const HOME_GOAL_STATUSES: OrchestrationWorkflowStatus[] = [
  'planning',
  'running',
  'verifying',
  'review',
];
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
const SERVER_ADVANCING_STATUSES = new Set<OrchestrationWorkflowStatus>([
  'planning',
  'running',
  'verifying',
]);

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

  /**
   * `agentId` is absent for a goal with no responsible agent — one created from
   * a project page. There is no per-agent list to prune in that case, so only
   * the scoped refetch happens, against the list scope the caller was rendering
   * (`project:<id>` on a project page, the agent id otherwise).
   */
  deleteGoal = async (
    agentId: string | undefined,
    orchestrationWorkflowId: string,
    scopeId?: string,
  ): Promise<void> => {
    await orchestrationWorkflowService.delete(orchestrationWorkflowId);
    if (agentId) {
      const current = this.#get().goalListByAgentId[agentId] ?? [];
      this.#set(
        ({ goalListByAgentId }) => ({
          goalListByAgentId: {
            ...goalListByAgentId,
            [agentId]: current.filter(
              ({ orchestrationWorkflow }) => orchestrationWorkflow.id !== orchestrationWorkflowId,
            ),
          },
        }),
        false,
        'deleteGoal/success',
      );
    }
    const scope = scopeId ?? agentId;
    if (scope) await this.refreshGoals(scope);
  };

  /**
   * Resolve a pending decision gate. `goalId` is the `goals` row id.
   *
   * Resolving a gate does not advance the graph — the coordinator only moves on
   * the next tick — so the caller decides whether to follow up with `tickGoal`.
   */
  decideGoal = async (
    orchestrationWorkflowId: string,
    params: { decisionId: string; optionId: string; resolution?: string },
  ): Promise<void> => {
    await orchestrationWorkflowService.decide({ id: orchestrationWorkflowId, ...params });
    await this.refreshGoalGraph(orchestrationWorkflowId);
  };

  pauseGoal = async (orchestrationWorkflowId: string): Promise<void> => {
    await orchestrationWorkflowService.pause(orchestrationWorkflowId);
    await this.refreshGoalGraph(orchestrationWorkflowId);
  };

  refreshGoalGraph = async (orchestrationWorkflowId: string): Promise<void> => {
    await mutate(goalKeys.graph(orchestrationWorkflowId));
  };

  resumeGoal = async (orchestrationWorkflowId: string): Promise<void> => {
    await orchestrationWorkflowService.resume(orchestrationWorkflowId);
    await this.refreshGoalGraph(orchestrationWorkflowId);
  };

  setGoalBudget = async (
    orchestrationWorkflowId: string,
    budget: {
      deadline?: string | null;
      maxConcurrentTasks?: number | null;
      maxRounds?: number | null;
      maxTotalCost?: number | null;
    },
  ): Promise<void> => {
    await orchestrationWorkflowService.setBudget({ id: orchestrationWorkflowId, ...budget });
    await this.refreshGoalGraph(orchestrationWorkflowId);
  };

  updateGoalRequirement = async (
    orchestrationWorkflowId: string,
    requirement: string,
  ): Promise<void> => {
    await orchestrationWorkflowService.updateRequirement(orchestrationWorkflowId, requirement);
    await this.refreshGoalGraph(orchestrationWorkflowId);
  };

  /**
   * Ask the server to run the coordinator now. The goal keeps advancing on its
   * own afterwards as its Work Tasks settle, so this is a nudge rather than the
   * loop the surface used to hold open.
   */
  advanceOrchestrationWorkflow = async (
    orchestrationWorkflowId: string,
  ): Promise<OrchestrationWorkflowTickResult> => {
    const result = await orchestrationWorkflowService.advance(orchestrationWorkflowId);
    await this.refreshGoalGraph(orchestrationWorkflowId);
    return result;
  };

  /** Exactly one coordinator step, for a caller that wants to inspect a single move. */
  tickGoal = async (orchestrationWorkflowId: string): Promise<OrchestrationWorkflowTickResult> => {
    const result = await orchestrationWorkflowService.tick(orchestrationWorkflowId);
    await this.refreshGoalGraph(orchestrationWorkflowId);
    return result;
  };

  /** The Goal Graph snapshot behind the process-control surface. */
  useFetchGoalGraph = (orchestrationWorkflowId?: string | null) =>
    useClientDataSWR(
      orchestrationWorkflowId ? goalKeys.graph(orchestrationWorkflowId) : null,
      () => orchestrationWorkflowService.getGraph(orchestrationWorkflowId!),
      {
        onSuccess: (graph) => {
          this.#set(
            ({ goalGraphById }) => ({
              goalGraphById: {
                ...goalGraphById,
                [orchestrationWorkflowId!]: graph,
              },
            }),
            false,
            'useFetchGoalGraph/success',
          );
        },
        refreshInterval: (graph) =>
          graph && SERVER_ADVANCING_STATUSES.has(graph.orchestrationWorkflow.status)
            ? GOAL_GRAPH_POLL_INTERVAL
            : 0,
        revalidateOnFocus: true,
      },
    );

  /**
   * North-star data of the goal detail header. Polls on the same cadence logic
   * as the graph: while the server is advancing, a probe Work or an agent
   * `recordObservation` can land a fresh point at any time.
   */
  useFetchGoalMetricSeries = (orchestrationWorkflowId?: string | null) =>
    useClientDataSWR(
      orchestrationWorkflowId ? goalKeys.metricSeries(orchestrationWorkflowId) : null,
      // Only the declared keys are fetched — the same goal can accumulate any
      // number of other sampled series, and none of them can affect this view.
      // Keys are read at fetch time; the declare path revalidates this cache
      // key right after refreshing the graph, so a newly declared clause is
      // fetched against fresh criteria.
      () =>
        metricService.listSeriesWithPoints(
          'orchestrationWorkflow',
          orchestrationWorkflowId!,
          (
            this.#get().goalGraphById[orchestrationWorkflowId!]?.orchestrationWorkflow.config
              ?.acceptance?.metrics ?? []
          ).map((criterion) => criterion.key),
        ),
      {
        onSuccess: (series) => {
          this.#set(
            ({ goalMetricSeriesById }) => ({
              goalMetricSeriesById: {
                ...goalMetricSeriesById,
                [orchestrationWorkflowId!]: series,
              },
            }),
            false,
            'useFetchGoalMetricSeries/success',
          );
        },
        refreshInterval: () => {
          const graph = this.#get().goalGraphById[orchestrationWorkflowId!];
          return graph && SERVER_ADVANCING_STATUSES.has(graph.orchestrationWorkflow.status)
            ? GOAL_GRAPH_POLL_INTERVAL
            : 0;
        },
        revalidateOnFocus: true,
      },
    );

  refreshGoalMetricSeries = async (orchestrationWorkflowId: string): Promise<void> => {
    await mutate(goalKeys.metricSeries(orchestrationWorkflowId));
  };

  /** Append one clause to the goal's measured acceptance and refresh both reads. */
  declareGoalMetric = async (
    orchestrationWorkflowId: string,
    criterion: OrchestrationWorkflowMetricCriterion,
  ): Promise<void> => {
    // Merged on the server against its current list — a replacement array
    // built from this client's snapshot would silently drop whatever a
    // concurrent editor or agent declared since the snapshot was read.
    await orchestrationWorkflowService.setMetricCriteria(
      orchestrationWorkflowId,
      [criterion],
      'merge',
    );
    await this.refreshGoalGraph(orchestrationWorkflowId);
    await this.refreshGoalMetricSeries(orchestrationWorkflowId);
  };

  /**
   * Record a measurement against the goal. The server schedules an advance
   * when the observation clears the gate, so the graph refresh may come back
   * already reopened.
   */
  recordGoalObservation = async (
    orchestrationWorkflowId: string,
    observation: { key: string; title?: string; value: number },
  ): Promise<void> => {
    await orchestrationWorkflowService.recordObservation(orchestrationWorkflowId, observation);
    await this.refreshGoalMetricSeries(orchestrationWorkflowId);
    await this.refreshGoalGraph(orchestrationWorkflowId);
  };

  loadMoreGoals = (): void => {
    this.#set(
      ({ goalListVisibleLimit }) => ({
        goalListVisibleLimit: goalListVisibleLimit + 10,
      }),
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
        orchestrationWorkflowService.list({
          agentId,
          limit: 100,
          projectId,
          statuses: GOAL_STATUSES,
        }),
      {
        onSuccess: ({ orchestrationWorkflows }) => {
          this.#set(
            ({ goalListByAgentId, goalListInitializedAgentIds }) => ({
              goalListByAgentId: {
                ...goalListByAgentId,
                [scopeId!]: orchestrationWorkflows,
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
        orchestrationWorkflowService.list({
          limit: HOME_GOAL_FETCH_LIMIT,
          statuses: HOME_GOAL_STATUSES,
        }),
      {
        onSuccess: ({ orchestrationWorkflows }) => {
          this.#set(
            ({ homeGoalsByScope, homeGoalsInitializedScopes }) => ({
              homeGoalsByScope: {
                ...homeGoalsByScope,
                [scope]: orchestrationWorkflows,
              },
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
