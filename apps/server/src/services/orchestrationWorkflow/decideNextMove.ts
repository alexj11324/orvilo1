import type {
  FrontierCandidate,
  OrchestrationWorkflowBudgetState,
  OrchestrationWorkflowMetricCriteriaState,
  OrchestrationWorkflowTickBranch,
  OrchestrationWorkflowTickOutcome,
} from '@orvilo/agent-tracing';
import {
  LEASE_EXPIRED_ERROR,
  ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE,
  VERIFICATION_ERRORED_ERROR,
  VERIFICATION_FAILED_ERROR,
} from '@orvilo/const/orchestrationWorkflow';
import type {
  OrchestrationWorkflowGraphNode,
  OrchestrationWorkflowGraphSnapshot,
  OrchestrationWorkflowMetricComparison,
  TaskItem,
} from '@orvilo/types';
import { toMetricScale } from '@orvilo/types';

export { ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE } from '@orvilo/const/orchestrationWorkflow';

/** Reason strings the recovery paths key off, written by the settle path. */
export { LEASE_EXPIRED_ERROR, VERIFICATION_ERRORED_ERROR, VERIFICATION_FAILED_ERROR };

export const TERMINAL_NODE_STATUSES = new Set(['resolved', 'rejected', 'retired']);

export interface FrontierSelection {
  /** Every eligible task node, best first — the trace-shaped view. */
  candidates: FrontierCandidate[];
  /** The first unblocked node, kept for callers that only need the head. */
  chosen?: OrchestrationWorkflowGraphNode;
  /** The same ranking, carrying the nodes the scheduler has to walk. */
  eligible: Array<{ blockedBy: string[]; node: OrchestrationWorkflowGraphNode }>;
}

/**
 * Rank the task nodes that could run right now.
 *
 * Split out of the decision so the caller can resolve the chosen node's task
 * before deciding, and exported so a trace keeps the whole ranking rather than
 * only the winner — "why not that node" is unanswerable from the winner alone.
 */
export const selectFrontier = (graph: OrchestrationWorkflowGraphSnapshot): FrontierSelection => {
  const resolvedNodeIds = new Set(
    graph.nodes.filter((node) => node.status === 'resolved').map((node) => node.id),
  );

  const eligible = graph.nodes
    .filter((node) => node.kind === 'task' && !TERMINAL_NODE_STATUSES.has(node.status))
    .map((node) => ({
      blockedBy: graph.edges
        .filter(
          (edge) =>
            edge.kind === 'depends_on' &&
            edge.sourceNodeId === node.id &&
            !resolvedNodeIds.has(edge.targetNodeId),
        )
        .map((edge) => edge.targetNodeId),
      node,
    }))
    .sort(
      (a, b) =>
        b.node.priority - a.node.priority ||
        a.node.createdAt.getTime() - b.node.createdAt.getTime(),
    );

  return {
    candidates: eligible.map(({ blockedBy, node }) => ({
      blockedBy,
      nodeId: node.id,
      priority: node.priority,
      status: node.status,
      title: node.title,
    })),
    chosen: eligible.find(({ blockedBy }) => blockedBy.length === 0)?.node,
    eligible,
  };
};

/**
 * Whether the coordinator would spend money on this task, and therefore whether
 * the budget has to be read before deciding.
 *
 * Every other task status resolves to a branch that costs nothing, so a orchestration workflow
 * that is merely waiting on a running Task does not pay for a budget query on
 * every sweep.
 */
export const needsBudget = (task?: TaskItem | null, status?: string | null): boolean => {
  // A candidate with no task yet will need one created and then dispatched.
  if (task === undefined) return true;
  if (task === null) return false;
  // A failure the coordinator can retry spends money too.
  const resolved = status ?? task.status;
  if (resolved === 'paused') {
    return task.error === LEASE_EXPIRED_ERROR || task.error === VERIFICATION_FAILED_ERROR;
  }
  return !['completed', 'failed', 'canceled', 'running', 'scheduled'].includes(resolved);
};

/**
 * Whether *any* unblocked candidate could start paid work this tick.
 *
 * Asking only about the frontier's head was safe while the head was the only
 * thing that could be dispatched. Now that the scheduler walks past a running
 * head to start an independent task, keying the budget off the head would let a
 * orchestration workflow spend past `maxRounds` / `maxTotalCost`: the head reports "no budget
 * needed", the budget is never read, and `budget_exhausted` cannot fire.
 */
export const frontierNeedsBudget = (
  frontier: FrontierSelection,
  tasksById: Map<string, TaskItem>,
  statusById?: ReadonlyMap<string, string>,
): boolean =>
  frontier.eligible.some(({ blockedBy, node }) => {
    if (blockedBy.length > 0) return false;
    if (!node.taskId) return true;
    const task = tasksById.get(node.taskId) ?? null;
    return needsBudget(task, task ? statusById?.get(task.id) : null);
  });

/**
 * Opening of the message the gate parks a orchestration workflow with, and therefore of the
 * reason recorded on its status trail. Shared so the recovery path that reads
 * historical parks back cannot drift from the wording that wrote them.
 */
export const MEASURED_ACCEPTANCE_PAUSE_REASON = 'Measured acceptance not met';

/** Evaluate one numeric clause. Kept beside the gate that consumes it. */
export const compareMetric = (
  rawValue: number,
  op: OrchestrationWorkflowMetricComparison,
  rawTarget: number,
): boolean => {
  // Both operands are read at the storage scale: the observation was already
  // rounded on its way into `numeric(20, 6)`, so comparing it against a
  // full-precision target would judge two different numbers — `eq 0.1234567`
  // could never hold, and `gte` / `lte` could flip at the rounding boundary.
  const value = toMetricScale(rawValue);
  const target = toMetricScale(rawTarget);
  switch (op) {
    case 'eq': {
      return value === target;
    }
    case 'gt': {
      return value > target;
    }
    case 'gte': {
      return value >= target;
    }
    case 'lt': {
      return value < target;
    }
    case 'lte': {
      return value <= target;
    }
  }
};

/**
 * Whether this tick could read numeric acceptance criteria: the orchestration workflow declares
 * some, and every Task node is terminal so the coordinator is in its terminal
 * phase. Keeps the extra reads off every dispatch tick.
 */
export const needsMetricCriteria = (graph: OrchestrationWorkflowGraphSnapshot): boolean => {
  if (!graph.orchestrationWorkflow.config?.acceptance?.metrics?.length) return false;
  const taskNodes = graph.nodes.filter((node) => node.kind === 'task');
  return taskNodes.length > 0 && taskNodes.every((node) => TERMINAL_NODE_STATUSES.has(node.status));
};

export interface OrchestrationWorkflowMoveInput {
  /** Required only when {@link needsBudget} says the branch could dispatch or recover. */
  budget?: OrchestrationWorkflowBudgetState;
  /** How many of this orchestration workflow's Tasks may be in flight at once. */
  concurrency: number;
  frontier: FrontierSelection;
  graph: OrchestrationWorkflowGraphSnapshot;
  /**
   * Required only when {@link needsMetricCriteria} holds — the terminal phase
   * of a orchestration workflow that declares numeric acceptance clauses. Evaluating them is a
   * database read, so it happens in `tick` and travels in, the same way the
   * budget does.
   */
  metricCriteria?: OrchestrationWorkflowMetricCriteriaState;
  /**
   * Canonical execution truth per task id — the SQL-derived retired `status`
   * labels ({@link TaskModel.derivedStatusByIds}). Rows missing from the map
   * fall back to the derived label on the task row itself.
   */
  statusById?: ReadonlyMap<string, string>;
  /**
   * The responsible Task of every candidate that has one, keyed by task id.
   * A candidate whose task id is absent from the map has lost its row.
   */
  tasksById: Map<string, TaskItem>;
}

/** Task statuses that occupy a concurrency slot. */
const IN_FLIGHT_STATUSES = new Set(['running', 'scheduled']);

/**
 * Whether this candidate is one the coordinator is already waiting on, and so
 * neither actionable nor a reason to stop looking at the others.
 */
const isInFlight = (task: TaskItem | undefined, status?: string | null): boolean =>
  Boolean(task && IN_FLIGHT_STATUSES.has(status ?? task.status));

export interface OrchestrationWorkflowMove {
  branch: OrchestrationWorkflowTickBranch;
  candidates: FrontierCandidate[];
  chosenNodeId?: string;
  /** The node this move is about when it is not the chosen frontier. */
  focusNodeId?: string;
  message: string;
  /**
   * The outcome this branch reports when it runs to completion. Recovery
   * branches can still end up elsewhere depending on how much budget is left,
   * which is why the trace records the actual outcome separately.
   */
  outcome: OrchestrationWorkflowTickOutcome;
  /** The responsible task this move is about, when it has one. */
  taskId?: string;
}

/**
 * The coordinator's decision, with no IO in it.
 *
 * `tick` used to interleave choosing and doing, so what it decided existed only
 * for as long as the call. Pulling the choice out means a trajectory can record
 * the decision surface and hand it back later: run this function over recorded
 * inputs and any change in coordinator policy shows up as a diff rather than as
 * a surprise on the next live orchestration workflow.
 */
export const decideNextMove = ({
  budget,
  concurrency,
  frontier,
  graph,
  metricCriteria,
  statusById,
  tasksById,
}: OrchestrationWorkflowMoveInput): OrchestrationWorkflowMove => {
  const { candidates, chosen } = frontier;
  const base = { candidates, chosenNodeId: chosen?.id };

  if (graph.orchestrationWorkflow.status === 'paused') {
    return {
      ...base,
      branch: 'orchestration_workflow_paused',
      message: 'Orchestration workflow is paused',
      outcome: 'no_progress',
    };
  }
  if (graph.orchestrationWorkflow.status === 'achieved') {
    return {
      ...base,
      branch: 'orchestration_workflow_terminal',
      message: 'Orchestration workflow is already achieved',
      outcome: 'achieved',
    };
  }
  if (
    graph.orchestrationWorkflow.status === 'failed' ||
    graph.orchestrationWorkflow.status === 'canceled'
  ) {
    return {
      ...base,
      branch: 'orchestration_workflow_terminal',
      message: `Orchestration workflow is ${graph.orchestrationWorkflow.status}`,
      outcome: 'failed',
    };
  }

  const pendingDecision = graph.decisions.find((decision) => decision.status === 'pending');
  if (pendingDecision) {
    return {
      ...base,
      branch: 'pending_decision',
      focusNodeId: pendingDecision.nodeId,
      message: pendingDecision.question,
      outcome: 'waiting_human',
    };
  }

  // Walk the whole ranked frontier rather than stopping at its head. Four bug
  // fixes that share no code have no reason to run one after another, and the
  // old single-node frontier made them: the running node stayed eligible, was
  // re-picked every tick, and reported `waiting_external`, which ends the
  // advance before anything behind it is even considered.
  const statusOf = (task: TaskItem): string => statusById?.get(task.id) ?? task.status;

  const inFlight = graph.nodes.filter((node) => {
    const task = tasksById.get(node.taskId ?? '');
    return node.kind === 'task' && isInFlight(task, task ? statusOf(task) : null);
  }).length;

  let parked = false;
  let capacityBlocked = false;
  let waitingOn: { node: OrchestrationWorkflowGraphNode; task: TaskItem } | undefined;

  for (const candidate of frontier.eligible) {
    if (candidate.blockedBy.length > 0) continue;

    const task = candidate.node.taskId ? tasksById.get(candidate.node.taskId) : undefined;
    if (isInFlight(task, task ? statusOf(task) : null)) {
      waitingOn ??= { node: candidate.node, task: task! };
      continue;
    }

    const move = decideForCandidate({
      budget,
      capacity: inFlight < concurrency,
      candidates,
      graph,
      node: candidate.node,
      status: task ? statusOf(task) : undefined,
      task: candidate.node.taskId ? (task ?? null) : undefined,
    });

    if (move === 'needs-capacity') {
      capacityBlocked = true;
      continue;
    }
    if (move === 'parked') {
      parked = true;
      continue;
    }
    return move;
  }

  if (!chosen) return decideWithoutFrontier(graph, candidates, metricCriteria);

  // Everything eligible is either running, parked on a person, or waiting for a
  // slot. Report which, so the row does not read as stalled when it is simply
  // saturated.
  if (waitingOn || capacityBlocked) {
    return {
      ...base,
      branch: 'task_running',
      chosenNodeId: waitingOn?.node.id ?? base.chosenNodeId,
      message: capacityBlocked
        ? `${inFlight} task(s) running at the concurrency limit of ${concurrency}`
        : `Task ${waitingOn!.task.identifier} is ${statusOf(waitingOn!.task)}`,
      outcome: 'waiting_external',
      taskId: waitingOn?.task.id,
    };
  }
  if (parked) {
    return {
      ...base,
      branch: 'task_paused',
      message: 'Every ready task is paused',
      outcome: 'waiting_human',
    };
  }

  return decideWithoutFrontier(graph, candidates, metricCriteria);
};

/** What one candidate wants, or why it cannot be acted on right now. */
type CandidateMove = OrchestrationWorkflowMove | 'needs-capacity' | 'parked';

const decideForCandidate = ({
  budget,
  capacity,
  candidates,
  graph,
  node,
  status,
  task,
}: {
  budget?: OrchestrationWorkflowBudgetState;
  capacity: boolean;
  candidates: FrontierCandidate[];
  graph: OrchestrationWorkflowGraphSnapshot;
  node: OrchestrationWorkflowGraphNode;
  status?: string;
  task: TaskItem | null | undefined;
}): CandidateMove => {
  const base = { candidates, chosenNodeId: node.id };

  if (task === undefined) {
    if (!capacity) return 'needs-capacity';
    return {
      ...base,
      branch: 'create_task',
      message: `Task "${node.title}" has no responsible task yet`,
      outcome: 'advanced',
    };
  }

  if (task === null) {
    return {
      ...base,
      branch: 'missing_task',
      message: 'Responsible task is missing',
      outcome: 'failed',
    };
  }

  return decideForTask(base, task, status ?? task.status, budget, graph, capacity);
};

const decideWithoutFrontier = (
  graph: OrchestrationWorkflowGraphSnapshot,
  candidates: FrontierCandidate[],
  metricCriteria?: OrchestrationWorkflowMetricCriteriaState,
): OrchestrationWorkflowMove => {
  const base = { candidates };
  const taskNodes = graph.nodes.filter((node) => node.kind === 'task');

  // A orchestration workflow with no tasks at all has not been planned yet — decompose it into
  // explorable directions before anything runs, instead of parking it.
  if (taskNodes.length === 0) {
    return {
      ...base,
      branch: 'plan_decomposition',
      message: 'Orchestration workflow has no tasks yet; plan its exploration structure first',
      outcome: 'advanced',
    };
  }

  const allTasksTerminal = taskNodes.every((node) => TERMINAL_NODE_STATUSES.has(node.status));

  if (!allTasksTerminal) {
    // Nothing here moves without a person: every remaining Task is blocked and
    // nothing is running to unblock it.
    return {
      ...base,
      branch: 'no_frontier',
      message: 'No task node is ready; resolve its dependencies first',
      outcome: 'no_progress',
    };
  }

  if (
    graph.nodes.some(
      (node) => node.kind === 'experiment' && !TERMINAL_NODE_STATUSES.has(node.status),
    )
  ) {
    return {
      ...base,
      branch: 'no_frontier',
      outcome: 'no_progress',
      message: 'An experiment still has unfinished work or an empty branch',
    };
  }

  // Exploration consumes real completed results before deciding whether to
  // extend the graph or hand the deliverable to the ordinary acceptance gate.
  if (
    graph.orchestrationWorkflow.config?.exploration &&
    !(
      graph.orchestrationWorkflow.config.exploration.checkpoint?.readyForAcceptance &&
      taskNodes.every(
        (node) =>
          node.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE ||
          graph.orchestrationWorkflow.config!.exploration!.checkpoint!.reviewedNodeIds?.includes(
            node.id,
          ),
      )
    )
  ) {
    return {
      ...base,
      branch: 'explore_graph',
      message: 'Evaluate completed experiments and choose the next graph expansion',
      outcome: 'advanced',
    };
  }

  // Measured clauses gate the delivery contract, and are checked before it:
  // an unmet number is not something a verifier can talk its way past, so
  // creating (or re-running) the acceptance Task against it would only spend
  // tokens to restate the gap. `no_progress` leaves the orchestration workflow running — the
  // next observation is what moves it, not another attempt.
  if (metricCriteria && !metricCriteria.allMet) {
    const unmet = metricCriteria.criteria.filter((criterion) => !criterion.met);
    return {
      ...base,
      branch: 'measured_acceptance',
      message: `${MEASURED_ACCEPTANCE_PAUSE_REASON}: ${unmet
        .map((c) => `${c.key} ${c.op} ${c.target} (${c.value ?? 'no observation'})`)
        .join(', ')}`,
      outcome: 'no_progress',
    };
  }

  const acceptanceTask = taskNodes.find(
    (node) => node.title === ORCHESTRATION_WORKFLOW_ACCEPTANCE_TASK_TITLE,
  );

  if (graph.orchestrationWorkflow.requirement && !acceptanceTask) {
    return {
      ...base,
      branch: 'terminal_acceptance',
      message: 'Every Task finished; the Orchestration workflow-level acceptance contract is next',
      outcome: 'advanced',
    };
  }
  if (graph.orchestrationWorkflow.requirement && acceptanceTask?.status !== 'resolved') {
    return {
      ...base,
      branch: 'terminal_acceptance',
      focusNodeId: acceptanceTask?.id,
      message: 'Orchestration workflow-level acceptance did not pass',
      outcome: 'no_progress',
    };
  }
  return {
    ...base,
    branch: 'terminal_acceptance',
    message: 'Orchestration workflow-level acceptance passed',
    outcome: 'achieved',
  };
};

const decideForTask = (
  base: { candidates: FrontierCandidate[]; chosenNodeId?: string },
  task: TaskItem,
  status: string,
  budget: OrchestrationWorkflowBudgetState | undefined,
  graph: OrchestrationWorkflowGraphSnapshot,
  capacity = true,
): CandidateMove => {
  if (status === 'completed') {
    return {
      ...base,
      branch: 'consume_completed',
      message: `Task ${task.identifier} completed`,
      outcome: 'advanced',
    };
  }

  if (status === 'failed' || status === 'canceled' || (status === 'paused' && task.error)) {
    if (
      budget?.deadlinePassed &&
      status === 'paused' &&
      (task.error === LEASE_EXPIRED_ERROR || task.error === VERIFICATION_FAILED_ERROR)
    ) {
      return {
        ...base,
        branch: 'budget_exhausted',
        message: `Deadline passed (${graph.orchestrationWorkflow.config?.schedule?.deadline ?? 'unknown'}); no new Task will be dispatched`,
        outcome: 'no_progress',
      };
    }
    if (status === 'paused' && task.error === LEASE_EXPIRED_ERROR) {
      if (!capacity) return 'needs-capacity';
      return {
        ...base,
        branch: 'recover_lease',
        message: `Task ${task.identifier} outlived its operation lease`,
        outcome: 'waiting_external',
      };
    }
    if (status === 'paused' && task.error === VERIFICATION_ERRORED_ERROR) {
      return {
        ...base,
        branch: 'verification_blocked',
        message: `Verification could not run for Task ${task.identifier}; repair the verifier and retry verification of the existing delivery`,
        outcome: 'waiting_external',
      };
    }
    if (status === 'paused' && task.error === VERIFICATION_FAILED_ERROR) {
      if (!capacity) return 'needs-capacity';
      return {
        ...base,
        branch: 'recover_verification',
        message: `Task ${task.identifier} did not pass verification`,
        outcome: 'waiting_external',
      };
    }
    return {
      ...base,
      branch: 'failure_decision',
      message: task.error ?? `Task ${status}`,
      outcome: 'waiting_human',
    };
  }

  // Parked on a person, and holding no slot. The orchestration workflow has other Tasks.
  if (status === 'paused') return 'parked';

  // Callers filter these out before they get here; kept so the classification
  // stays total if a status slips through.
  if (status === 'running' || status === 'scheduled') return 'parked';

  if (budget?.deadlinePassed) {
    return {
      ...base,
      branch: 'budget_exhausted',
      message: `Deadline passed (${graph.orchestrationWorkflow.config?.schedule?.deadline ?? 'unknown'}); no new Task will be dispatched`,
      outcome: 'no_progress',
    };
  }

  if (budget?.deadlinePassed) {
    return {
      ...base,
      branch: 'budget_exhausted',
      message: `Deadline passed (${graph.orchestrationWorkflow.config?.schedule?.deadline ?? 'unknown'}); no new Task will be dispatched`,
      outcome: 'no_progress',
    };
  }

  if (budget?.roundLimitReached || budget?.costLimitReached) {
    return {
      ...base,
      branch: 'budget_exhausted',
      message: budget.roundLimitReached
        ? `Round budget reached (${budget.runs}/${graph.orchestrationWorkflow.maxRounds})`
        : `Cost budget reached ($${budget.totalCost.toFixed(4)}/$${graph.orchestrationWorkflow.maxTotalCost})`,
      outcome: 'no_progress',
    };
  }

  if (!capacity) return 'needs-capacity';

  // Dispatching is progress, not a stopping point: the advance should carry on
  // and fill the remaining slots rather than end after starting one Task.
  return {
    ...base,
    branch: 'dispatch_task',
    message: `Task ${task.identifier} is ready to run`,
    outcome: 'advanced',
  };
};
