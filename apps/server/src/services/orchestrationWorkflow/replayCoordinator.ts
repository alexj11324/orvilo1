import type {
  OrchestrationWorkflowDecider,
  OrchestrationWorkflowDecision,
  OrchestrationWorkflowDecisionInput,
  OrchestrationWorkflowGraphState,
  OrchestrationWorkflowReplayResult,
  OrchestrationWorkflowTrajectory,
} from '@orvilo/agent-tracing';
import { replayOrchestrationWorkflowTrajectory } from '@orvilo/agent-tracing';
import type { OrchestrationWorkflowGraphSnapshot, TaskItem } from '@orvilo/types';

import { decideNextMove, selectFrontier } from './decideNextMove';

/** Matches `resolveMaxConcurrentTasks`'s default, for traces that predate it. */
const DEFAULT_REPLAY_CONCURRENCY = 3;

/**
 * Lift a recorded graph back into the shape the coordinator reads.
 *
 * The trace stores only what the decision depends on, so this fills the rest
 * with empty values rather than inventing content: `decideNextMove` never looks
 * at descriptions, events or work versions, and a replay that fabricated them
 * would be testing something the original run never saw.
 */
export const fromTraceGraphState = (
  state: OrchestrationWorkflowGraphState,
): OrchestrationWorkflowGraphSnapshot =>
  ({
    decisions: state.decisions.map((decision) => ({
      ...decision,
      options: null,
      recommendedOptionId: null,
    })),
    edges: state.edges,
    events: [],
    orchestrationWorkflow: {
      ...state.orchestrationWorkflow,
      config: state.orchestrationWorkflow.exploration
        ? { exploration: state.orchestrationWorkflow.exploration }
        : null,
      projectId: null,
    },
    nodes: state.nodes.map((node) => ({
      ...node,
      createdAt: new Date(node.createdAt),
      description: null,
    })),
    workVersions: [],
  }) as unknown as OrchestrationWorkflowGraphSnapshot;

/** Rebuild the task map the scheduler reads from the recorded candidate states. */
const toTasksById = (input: OrchestrationWorkflowDecisionInput): Map<string, TaskItem> =>
  new Map(
    (input.candidateTasks ?? []).map((task) => [
      task.id,
      { ...task, updatedAt: new Date(task.updatedAt) } as TaskItem,
    ]),
  );

/**
 * The live coordinator, as a decider a recorded trajectory can be replayed
 * against.
 *
 * This is the whole payoff of splitting the decision out of `tick`: the
 * function under test here is the one production runs, not a model of it.
 */
export const coordinatorDecider: OrchestrationWorkflowDecider = (
  input,
): OrchestrationWorkflowDecision => {
  const graph = fromTraceGraphState(input.graph);
  const frontier = selectFrontier(graph);
  const move = decideNextMove({
    budget: input.budget,
    // A trajectory recorded before the cap existed replays at its default.
    concurrency: input.concurrency ?? DEFAULT_REPLAY_CONCURRENCY,
    frontier,
    graph,
    metricCriteria: input.metricCriteria,
    tasksById: toTasksById(input),
  });

  return { branch: move.branch, candidates: move.candidates, chosenNodeId: move.chosenNodeId };
};

/**
 * Replay a recorded orchestration workflow against the current coordinator.
 *
 * An empty `divergences` means a rule change was inert on this run; every entry
 * is a real behavioural difference, with the advance and tick that produced it.
 */
export const replayOrchestrationWorkflowAgainstCurrentCoordinator = (
  trajectory: OrchestrationWorkflowTrajectory,
): OrchestrationWorkflowReplayResult =>
  replayOrchestrationWorkflowTrajectory(trajectory, coordinatorDecider);
