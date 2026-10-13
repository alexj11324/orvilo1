/**
 * OrchestrationWorkflow trajectory — the same trace format as {@link ExecutionSnapshot}, one
 * level up.
 *
 * An operation is one complete agent execution and gets one `ExecutionSnapshot`
 * whose steps are LLM/tool calls. A orchestration workflow is one complete *orchestration workflow* execution and
 * gets one `OrchestrationWorkflowTrajectory` whose steps are advances. The nesting closes at the
 * leaf: an advance dispatches a task run, that run is an operation, and its
 * `operationId` is recorded here rather than its content copied — so
 * `agent-tracing inspect <opId>` continues from where the orchestration workflow trace stops.
 *
 * Graph entities are typed structurally instead of importing `@orvilo/types`,
 * matching how `StepSnapshot.messages` stays loose: a trace format has to keep
 * reading objects written by older code.
 */

/** What caused this advance. `unknown` covers traces written before a caller was labelled. */
export type OrchestrationWorkflowAdvanceTrigger =
  | 'create'
  | 'decide'
  | 'settle'
  | 'sweep'
  | 'resume'
  | 'restart'
  | 'budget'
  | 'manual'
  /** A measurement landed — the orchestration workflow moves on observation, not only on work. */
  | 'observe'
  | 'unknown';

/** Which arm of the coordinator ran. One per `tick` return path. */
export type OrchestrationWorkflowTickBranch =
  /** Orchestration workflow is paused or already terminal — nothing to decide. */
  | 'orchestration_workflow_paused'
  | 'orchestration_workflow_terminal'
  /** A gate is open; the orchestration workflow is parked on a person. */
  | 'pending_decision'
  /** No task node is eligible: none exists, or all remaining ones are blocked. */
  | 'no_frontier'
  /** The graph has no tasks yet — decompose the orchestration workflow into explorable directions first. */
  | 'plan_decomposition'
  | 'explore_graph'
  /** Every task node finished; the orchestration workflow-level acceptance contract is next. */
  | 'terminal_acceptance'
  /**
   * Every task node finished, but a declared numeric clause is unmet, so the
   * delivery contract is not attempted. Distinct from `terminal_acceptance`
   * on purpose: both stop in the terminal phase, and a replay that could not
   * tell them apart would report a regressed gate as a match.
   */
  | 'measured_acceptance'
  /** The chosen task node has no responsible task yet. */
  | 'create_task'
  /** Its task row is gone. */
  | 'missing_task'
  /** Its task finished; fold the outcome into a finding. */
  | 'consume_completed'
  /** Its operation outlived the lease / failed verification — automatic recovery. */
  | 'recover_lease'
  | 'recover_verification'
  | 'verification_blocked'
  /** Recovery is exhausted or the failure is not recoverable; open a gate. */
  | 'failure_decision'
  /** Task is parked or already in flight. */
  | 'task_paused'
  | 'task_running'
  /** Budget stopped the orchestration workflow before this task could be dispatched. */
  | 'budget_exhausted'
  /** Start a run for the chosen task. */
  | 'dispatch_task';

export type OrchestrationWorkflowTickOutcome =
  'advanced' | 'achieved' | 'waiting_human' | 'waiting_external' | 'no_progress' | 'failed';

// ==================== Graph state ====================

export interface OrchestrationWorkflowTraceOrchestrationWorkflow {
  agentId?: string | null;
  exploration?: {
    instruction: string;
    maxExperiments: number;
    checkpoint?: {
      token: string;
      snapshot: string;
      expiresAt: string;
      readyForAcceptance?: boolean;
      reviewedNodeIds?: string[];
    };
  };
  id: string;
  maxRounds?: number | null;
  maxTotalCost?: number | null;
  requirement?: string | null;
  status: string;
  title: string;
}

export interface OrchestrationWorkflowTraceNode {
  /** Epoch ms. Drives the frontier tie-break, so replay needs it. */
  createdAt: number;
  id: string;
  kind: string;
  priority: number;
  status: string;
  taskId?: string | null;
  title: string;
}

export interface OrchestrationWorkflowTraceEdge {
  id: string;
  kind: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface OrchestrationWorkflowTraceDecision {
  id: string;
  nodeId: string;
  question: string;
  resolvedOptionId?: string | null;
  status: string;
}

/** Everything the coordinator reads about the graph when it decides. */
export interface OrchestrationWorkflowGraphState {
  decisions: OrchestrationWorkflowTraceDecision[];
  edges: OrchestrationWorkflowTraceEdge[];
  nodes: OrchestrationWorkflowTraceNode[];
  orchestrationWorkflow: OrchestrationWorkflowTraceOrchestrationWorkflow;
}

/**
 * Change relative to the previous advance's state. Same baseline+delta shape as
 * `messagesBaseline` / `messagesDelta`: the trajectory carries one full state
 * and every later advance stores only what moved.
 */
export interface OrchestrationWorkflowGraphDelta {
  decisionsUpserted?: OrchestrationWorkflowTraceDecision[];
  edgesAdded?: OrchestrationWorkflowTraceEdge[];
  edgesRemoved?: string[];
  nodesRemoved?: string[];
  nodesUpserted?: OrchestrationWorkflowTraceNode[];
  orchestrationWorkflow?: Partial<OrchestrationWorkflowTraceOrchestrationWorkflow>;
}

// ==================== Decision input surface ====================

/**
 * A task node that was eligible this tick. Losers are recorded too — without
 * them a trace cannot answer "why not that node", which is the whole point of
 * keeping the input surface rather than the result.
 */
export interface FrontierCandidate {
  blockedBy: string[];
  nodeId: string;
  priority: number;
  status: string;
  title: string;
}

/** Budget as the coordinator read it, not as it looks now. */
export interface OrchestrationWorkflowBudgetState {
  costLimitReached: boolean;
  /**
   * The orchestration workflow's calendar-time budget (config.schedule.deadline), evaluated at
   * decision time. Time-based stopping is derived, not stored — a replay of a
   * recorded trajectory must see the same verdict the live run saw, so it
   * travels with the budget rather than being recomputed from the wall clock.
   */
  deadlinePassed?: boolean;
  maxRounds?: number | null;
  maxTotalCost?: number | null;
  roundLimitReached: boolean;
  runs: number;
  totalCost: number;
}

/**
 * One numeric acceptance clause as it read at decision time.
 *
 * The measured value travels with the verdict for the same reason
 * `deadlinePassed` does: a replay must see the number the live run saw, not
 * whatever the series holds when the trajectory is re-read.
 */
export interface OrchestrationWorkflowMetricCriterionState {
  key: string;
  met: boolean;
  /** When the recorded value was observed; absent when nothing was measured. */
  observedAt?: number;
  op: string;
  target: number;
  /** Latest observation, or null when the series has no points (or no series). */
  value: number | null;
}

/** The measured half of Orchestration workflow acceptance, evaluated only in the terminal phase. */
export interface OrchestrationWorkflowMetricCriteriaState {
  allMet: boolean;
  criteria: OrchestrationWorkflowMetricCriterionState[];
}

/** A candidate's responsible task at decision time; drives every post-dispatch branch. */
export interface OrchestrationWorkflowFrontierTaskState {
  error?: string | null;
  id: string;
  identifier?: string;
  /** The task node this task belongs to, so a reader can line the two up. */
  nodeId?: string;
  status: string;
  updatedAt: number;
}

/** Cheap shape metrics — enough to chart convergence without re-folding the graph. */
export interface OrchestrationWorkflowGraphShape {
  edgesTotal: number;
  findings: number;
  gatesPending: number;
  nodesTotal: number;
  tasksBlocked: number;
  tasksCompleted: number;
  tasksOpen: number;
  tasksReady: number;
}

// ==================== Snapshots ====================

export interface OrchestrationWorkflowTickSnapshot {
  /** When the coordinator entered this tick. Staleness branches read the clock, so replay needs it. */
  at: number;
  branch: OrchestrationWorkflowTickBranch;
  /**
   * Absent on branches that never funded anything — a paused orchestration workflow, an open
   * gate, an empty frontier. Recording a budget the coordinator did not read
   * would put a number in the decision input that never influenced it.
   */
  budget?: OrchestrationWorkflowBudgetState;
  candidates: FrontierCandidate[];
  /**
   * The responsible task of every candidate that had one. The scheduler reads
   * all of them — it has to know which are in flight before it can decide what
   * else to start — so recording only the chosen one would leave a replay
   * unable to reproduce the decision.
   */
  candidateTasks?: OrchestrationWorkflowFrontierTaskState[];
  chosenNodeId?: string;
  /** Concurrency cap in force for this tick. */
  concurrency?: number;
  /** What this tick changed. Attributed per tick so an advance's writes stay ordered. */
  effects: OrchestrationWorkflowAdvanceEffect[];
  /**
   * @deprecated Superseded by `candidateTasks`, which carries every candidate
   * rather than only the chosen one. Still read when replaying trajectories
   * recorded before the scheduler could look past the head of the frontier.
   */
  frontierTask?: OrchestrationWorkflowFrontierTaskState;
  /**
   * Graph change since the previously recorded tick, observed on entry to this
   * one. Folding every delta up to and including this field reproduces exactly
   * what the coordinator read before it decided — which is what makes replay
   * possible. Ticks carry it rather than advances because an advance runs a
   * loop of them and each one re-reads the graph.
   */
  graphDelta?: OrchestrationWorkflowGraphDelta;
  graphShape: OrchestrationWorkflowGraphShape;
  index: number;
  message: string;
  /**
   * Present only on terminal-phase decisions of a orchestration workflow that declares numeric
   * criteria — the one place the coordinator reads them.
   */
  metricCriteria?: OrchestrationWorkflowMetricCriteriaState;
  outcome: OrchestrationWorkflowTickOutcome;
  taskId?: string;
}

export type OrchestrationWorkflowEffectType =
  | 'created_task'
  | 'started_run'
  | 'opened_decision'
  | 'resolved_decision'
  | 'created_node'
  | 'attached_work_version'
  | 'node_status'
  | 'orchestration_workflow_status'
  | 'released_claim';

export interface OrchestrationWorkflowAdvanceEffect {
  detail?: string;
  nodeId?: string;
  /** The agent operation this effect put in flight or consumed — the drill-down key. */
  operationId?: string;
  targetId?: string;
  type: OrchestrationWorkflowEffectType;
}

export interface OrchestrationWorkflowAdvanceSnapshot {
  /** Operations this advance put in flight. The hand-off to `inspect <opId>`. */
  childOperationIds?: string[];
  completedAt: number;
  durationMs: number;
  error?: { message: string; type: string };
  seq: number;
  startedAt: number;
  ticks: OrchestrationWorkflowTickSnapshot[];
  trigger: OrchestrationWorkflowAdvanceTrigger;
}

export interface OrchestrationWorkflowTrajectory {
  advances: OrchestrationWorkflowAdvanceSnapshot[];
  completedAt?: number;
  /** Terminal orchestration workflow status — `achieved` / `failed` / `canceled`. */
  completionReason?: string;
  /** State before the first recorded advance; later states fold forward from here. */
  graphBaseline: OrchestrationWorkflowGraphState;
  orchestrationWorkflowId: string;
  startedAt: number;
  title: string;
  totalAdvances: number;
  totalTicks: number;
  traceId: string;
  userId?: string;
}

export interface OrchestrationWorkflowTraceSummary {
  advances: number;
  completionReason?: string;
  createdAt: number;
  durationMs: number;
  orchestrationWorkflowId: string;
  title: string;
}
