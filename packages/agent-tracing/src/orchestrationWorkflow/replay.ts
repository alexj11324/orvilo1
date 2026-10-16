import { reconstructGraphAt } from './delta';
import type {
  FrontierCandidate,
  OrchestrationWorkflowBudgetState,
  OrchestrationWorkflowFrontierTaskState,
  OrchestrationWorkflowGraphState,
  OrchestrationWorkflowMetricCriteriaState,
  OrchestrationWorkflowTickBranch,
  OrchestrationWorkflowTrajectory,
} from './types';

/**
 * Everything the coordinator's decision depends on. Anything not in here must
 * not change what it picks, or the trace is not a replayable record.
 */
export interface OrchestrationWorkflowDecisionInput {
  budget?: OrchestrationWorkflowBudgetState;
  /** Every candidate's responsible task — the scheduler reads all of them. */
  candidateTasks?: OrchestrationWorkflowFrontierTaskState[];
  concurrency?: number;
  /** @deprecated Legacy single-task shape; present only on older trajectories. */
  frontierTask?: OrchestrationWorkflowFrontierTaskState;
  graph: OrchestrationWorkflowGraphState;
  /** Numeric acceptance clauses as the recorded tick read them. */
  metricCriteria?: OrchestrationWorkflowMetricCriteriaState;
}

/**
 * What the coordinator *chose*. Deliberately excludes the outcome: a branch
 * like `recover_lease` reports `waiting_external` or `waiting_human` depending
 * on whether recovery still had budget, and that is the result of running the
 * branch rather than part of the decision. Comparing it would flag work the
 * decider was never asked to do.
 */
export interface OrchestrationWorkflowDecision {
  branch: OrchestrationWorkflowTickBranch;
  /** Every eligible task node, in the order the coordinator ranked them. */
  candidates: FrontierCandidate[];
  chosenNodeId?: string;
}

export type OrchestrationWorkflowDecider = (
  input: OrchestrationWorkflowDecisionInput,
) => OrchestrationWorkflowDecision;

export interface OrchestrationWorkflowReplayDivergence {
  advanceSeq: number;
  field: 'branch' | 'chosenNodeId' | 'candidates';
  recorded: string;
  replayed: string;
  tickIndex: number;
}

export interface OrchestrationWorkflowReplayResult {
  divergences: OrchestrationWorkflowReplayDivergence[];
  matched: number;
  orchestrationWorkflowId: string;
  ticks: number;
}

const candidateOrder = (candidates: FrontierCandidate[]): string =>
  candidates.map((candidate) => candidate.nodeId).join(',');

/**
 * Re-run a decider over a recorded trajectory and report where it now decides
 * differently.
 *
 * Feeding the current implementation its own history is how a coordinator rule
 * change gets a regression signal: an empty `divergences` means the change was
 * inert on this run, and every entry is a real behavioural difference with the
 * exact input that produced it. No database and no environment — the trajectory
 * carries the whole decision surface.
 */
export const replayOrchestrationWorkflowTrajectory = (
  trajectory: OrchestrationWorkflowTrajectory,
  decide: OrchestrationWorkflowDecider,
): OrchestrationWorkflowReplayResult => {
  const divergences: OrchestrationWorkflowReplayDivergence[] = [];
  let ticks = 0;
  let matched = 0;

  for (const advance of trajectory.advances) {
    for (const tick of advance.ticks) {
      ticks += 1;
      const graph: OrchestrationWorkflowGraphState = reconstructGraphAt(
        trajectory,
        advance.seq,
        tick.index,
      );
      const replayed = decide({
        budget: tick.budget,
        metricCriteria: tick.metricCriteria,
        // A trajectory recorded before the scheduler existed has only the
        // chosen candidate's task. Dropping it would replay every one of those
        // ticks as `missing_task` and report divergences that never happened.
        candidateTasks:
          tick.candidateTasks ?? (tick.frontierTask ? [tick.frontierTask] : undefined),
        concurrency: tick.concurrency,
        graph,
      });

      const before = divergences.length;
      const record = (
        field: OrchestrationWorkflowReplayDivergence['field'],
        recordedValue: string,
        replayedValue: string,
      ) => {
        if (recordedValue !== replayedValue) {
          divergences.push({
            advanceSeq: advance.seq,
            field,
            recorded: recordedValue,
            replayed: replayedValue,
            tickIndex: tick.index,
          });
        }
      };

      record('branch', tick.branch, replayed.branch);
      record('chosenNodeId', tick.chosenNodeId ?? '', replayed.chosenNodeId ?? '');
      record('candidates', candidateOrder(tick.candidates), candidateOrder(replayed.candidates));

      if (divergences.length === before) matched += 1;
    }
  }

  return {
    divergences,
    orchestrationWorkflowId: trajectory.orchestrationWorkflowId,
    matched,
    ticks,
  };
};
