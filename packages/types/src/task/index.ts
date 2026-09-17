import type { BriefArtifacts } from '../brief';
import type { ChatFileItem } from '../message/ui/chat';

// ── Task type aliases ──

export type TaskStatus =
  'backlog' | 'canceled' | 'completed' | 'failed' | 'paused' | 'running' | 'scheduled';

/**
 * Business workflow is independent from execution. `workflowStateId` keeps the
 * exact provider/team state while this category gives the shared board a
 * stable local grouping.
 */
export type TaskWorkflowCategory =
  'triage' | 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';

export type TaskAssignmentMode = 'manual' | 'rules' | 'orchestrated';

export type TaskOrchestrationOwner = 'manual' | `goal:${string}` | `project:${string}`;

export type TaskCreationSubjectKind = 'agent' | 'integration' | 'system' | 'user';

export type TaskLockField = 'assignee' | 'priority' | 'requirement' | 'workflow';

export interface TaskHumanLock {
  actorId?: string;
  actorKind: 'agent' | 'system' | 'user';
  at: string;
  reason?: string;
  revision: number;
}

export interface TaskCreationSubjectSnapshot {
  displayName?: string;
  externalId?: string;
  kind: TaskCreationSubjectKind;
}

export type TaskRunState =
  | 'queued'
  | 'provisioning'
  | 'running'
  | 'waiting'
  | 'cancel_requested'
  | 'canceled'
  | 'failed'
  | 'succeeded'
  | 'outcome_unknown';

export type TaskDispatchPhase =
  | 'requested'
  | 'claimed'
  | 'provisioning'
  | 'dispatched'
  | 'running'
  | 'waiting'
  | 'cancel_requested'
  | 'canceled'
  | 'failed'
  | 'succeeded'
  | 'outcome_unknown';

export interface TaskExecutionEnvironmentSnapshot {
  branch?: string;
  deviceId?: string;
  provider?: string;
  repo?: string;
  workingDirectory?: string;
  workingDirectoryId?: string;
}

export type TaskPriority = 0 | 1 | 2 | 3 | 4;

export type TaskActivityType =
  'assignment' | 'brief' | 'comment' | 'created' | 'property' | 'topic';

/**
 * Persisted event kinds in `task_activities`. Kept as a plain union (the column
 * is `text`) so onboarding a new event — status, priority, … — is a type-only
 * change with no migration.
 */
export type TaskActivityLogType =
  'assignee_agent' | 'assignee_user' | 'automation' | 'priority' | 'reviewer' | 'status';

/**
 * Payload of a `task_activities` row: what the slot moved between.
 * Assignee events carry ids (`fromId` / `toId`); a status event carries the
 * status strings themselves (`from` / `to`).
 */
export interface TaskActivityLogPayload {
  /**
   * Who kind of party made the change, recorded at write time. The actor
   * columns are `ON DELETE SET NULL` foreign keys, so once the user or agent
   * is deleted this is the only trace that somebody — not the system — did
   * it. Absent on rows written before it was introduced; treated as system.
   */
  actorKind?: 'agent' | 'system' | 'user';
  from?: TaskActivityValue;
  fromId?: string | null;
  to?: TaskActivityValue;
  toId?: string | null;
}

/**
 * The automation columns as one logical value. Turning a schedule on rewrites
 * mode + pattern + timezone in a single save; logging each column would put
 * three lines in the feed for one decision.
 */
export interface TaskAutomationSnapshot {
  heartbeatInterval: number | null;
  /** `config.schedule.maxExecutions`; null = unlimited. Part of the schedule a user edits. */
  maxExecutions: number | null;
  mode: TaskAutomationMode | null;
  schedulePattern: string | null;
  scheduleTimezone: string | null;
}

export type TaskActivityValue = number | string | TaskAutomationSnapshot | null;

/** Which assignee slot an `assignment` activity describes. */
export type TaskAssignmentKind = 'agent' | 'member' | 'reviewer';

// null = no automation
export type TaskAutomationMode = 'heartbeat' | 'schedule';

/**
 * What triggered a given task run. Threaded from the run entry point
 * (`TaskRunnerService.runTask`) through to `onTopicComplete` so lifecycle
 * decisions can tell an ad-hoc manual "run now" apart from an automation tick.
 *
 * - `manual`    — user (or an agent tool call) invoked the run ad-hoc. Its
 *                 failure is a one-off signal and must NOT change the task's
 *                 scheduling state, nor count against the maxExecutions quota.
 * - `schedule`  — a cron `schedule` tick fired the run.
 * - `heartbeat` — a heartbeat interval tick fired the run.
 * - `goal`      — the Goal coordinator started this Work attempt.
 *                 Like `manual`, it never counts against automation quotas.
 * - `orchestrator` — the dependency/project planner started this run. Project
 *                    dispatch policy and execution budgets apply.
 */
export type TaskRunTrigger = 'manual' | 'schedule' | 'heartbeat' | 'goal' | 'orchestrator';

/**
 * A clarifying question the intent reader wants answered before an agent
 * starts. Only raised when different answers change what gets delivered.
 */
export interface TaskIntentClarification {
  /** What concretely changes depending on the answer. */
  impact?: string;
  /** Enumerable candidate answers, offered as one-tap chips. */
  options?: string[];
  question: string;
}

/**
 * What the intent reader understood from the raw text typed into the task
 * composer. Purely advisory — nothing here is persisted until the user (or the
 * auto path, for an unambiguous request) confirms it.
 */
export interface TaskIntentAnalysis {
  clarifications: TaskIntentClarification[];
  /** How sure the reader is the brief can go to an executor as-is. */
  confidence: 'high' | 'medium' | 'low';
  /** Whether this is a single delivery or a standing goal. */
  kind: 'task' | 'goal';
  kindReason?: string;
  /** The request rewritten as a full brief, without added scope. */
  refinedInstruction: string;
  /** One sentence, addressed to the user: the outcome that was understood. */
  summary: string;
  title: string;
}

/**
 * The brief produced after the user answers, replacing the pre-answer reading.
 * A second pass is needed because the first one was written while those details
 * were still open, so it names them as gaps the answers have since closed.
 */
export interface TaskInstructionSynthesis {
  instruction: string;
  title: string;
}

// ── Config types ──

export interface CheckpointConfig {
  onAgentRequest?: boolean;
  tasks?: {
    afterIds?: string[];
    beforeIds?: string[];
  };
  topic?: {
    after?: boolean;
    before?: boolean;
  };
}

/**
 * Repo workspace binding persisted under `tasks.config.workspace`. When present,
 * the runner provisions an isolated git worktree on the bound device for every
 * fresh run (branch `task/<identifier>`) and pins the topic's working directory
 * to it — so parallel task runs never share one checkout. Subtasks inherit the
 * nearest ancestor's binding (whole-config semantics).
 */
export interface TaskWorkspaceConfig {
  /**
   * Integration target branch. Default: the repo's remote default branch when
   * `origin/HEAD` resolves, else the source checkout's current branch.
   */
  baseBranch?: string;
  /**
   * Pinned execution device. When omitted, provisioning inherits the assignee
   * agent's `agencyConfig.boundDeviceId`; runs with no concrete device
   * (auto/sandbox/in-process) execute unprovisioned.
   */
  deviceId?: string;
  provider: 'git';
  /**
   * GitHub coordinate (`owner/repo` or clone URL) identifying the repository
   * for runs that cannot use a device worktree — cloud-sandbox runs pre-clone
   * it into `/workspace` and land work via a pushed `task/<id>` branch + PR,
   * merged back by a later integrator run.
   */
  repo?: string;
  /**
   * Absolute path of the repository on the device. Required for device
   * worktree provisioning; may be omitted on cloud-only bindings.
   */
  repoPath?: string;
}

/**
 * Per-run workspace/integration record persisted on `task_topics.integration`.
 * Written by the task runner at provision time and advanced by
 * TaskIntegrationService once the run's topic completes.
 */
export interface TaskTopicIntegration {
  /** Number of corrective merge runs dispatched so far. */
  attempts: number;
  /** Integration target branch the task branch merges into. */
  baseBranch: string;
  /** Branch created for the run (`task/<identifier>`). */
  branch: string;
  /** Repo-relative paths reported unmerged at the last attempt. */
  conflicts?: null | string[];
  /**
   * Device hosting the worktrees. Absent on sandbox-contract records — those
   * integrate through the remote (`repo`) rather than a device worktree.
   */
  deviceId?: string;
  /** Immutable base commit observed when the delivery run completed. */
  expectedBaseSha?: string;
  /** Immutable source commit accepted for this delivery. */
  expectedHeadSha?: string;
  /** Merge commit SHA once `state` reaches 'integrated'. */
  integratedSha?: string;
  /** Topic that owns the integration worktree. */
  integrationOwnerTopicId?: string;
  /** True once the topic-owned integration worktree was removed. */
  integrationWorktreeCleaned?: boolean;
  /** Path of the detached integration worktree on the device. */
  integrationWorktreePath?: string;
  lastError?: null | string;
  /** Machine-readable recovery reason used by the task UI. */
  lastErrorCode?:
    | 'authorization_required'
    | 'merge_conflict'
    | 'publish_failed'
    | 'remote_verification_unavailable'
    | 'workspace_unavailable'
    | null;
  /** Pull request number bound to this delivery, when known. */
  prNumber?: number;
  /** Short lease protecting completion/retry handling from duplicate delivery. */
  processingStartedAt?: string | null;
  processingToken?: string | null;
  /** URL of the pull request opened for {@link branch}, when known. */
  prUrl?: string;
  /** True once the merge result was pushed to `origin/<baseBranch>`. */
  pushedToRemote?: boolean;
  /**
   * GitHub coordinate (`owner/repo` or URL) for sandbox-contract runs. Its
   * presence marks the record as remote: no device worktrees exist, the run's
   * branch lives on the remote, and merge state is verified via the GitHub API.
   */
  repo?: string;
  /** Absolute repo path on the device (source of both worktrees). */
  repoPath?: string;
  /**
   * 'task' — the run's own provisioned worktree;
   * 'integrate' — a corrective run bound to the integration worktree.
   */
  role: 'task' | 'integrate';
  /**
   * On 'integrate' rows: the task_topics row of the original task run, so its
   * record can be advanced once the merge lands.
   */
  runTopicId?: string;
  /** pending → merging → integrated | recoverable failure | blocked | skipped */
  state:
    | 'pending'
    | 'merging'
    | 'integrated'
    | 'conflict'
    | 'publish_failed'
    | 'verification_pending'
    | 'blocked'
    | 'skipped';
  /**
   * Original verified delivery waiting for this corrective integration chain.
   * Once the chain settles, the lifecycle re-drives that Verify run so task
   * completion and the creator callback still use the accepted delivery.
   */
  verifyOperationId?: string;
  /** True once the provisioned worktree was removed after integration. */
  worktreeCleaned?: boolean;
  /**
   * Worktree path the run executes in (task or integration worktree). Absent
   * on sandbox-contract records — the clone lives inside the ephemeral sandbox.
   */
  worktreePath?: string;
}

/**
 * Legacy Task-level delivery-acceptance gate config persisted under
 * `tasks.config.verify`. New flows persist this policy on the Task's Acceptance;
 * this shape remains for API compatibility and lazy migration. It is *not*
 * unioned with any agent-level mount
 * (`agencyConfig.verifyRubricId`) — the task config is authoritative and never
 * field-level merged with the agent-level rubric.
 *
 * Subtasks inherit with whole-config override semantics: a subtask uses its own
 * config when present, otherwise the nearest ancestor's config in full (never a
 * field-level merge). Resolved at runtime via `TaskModel.resolveVerifyConfig`.
 */
export interface TaskVerifyConfig {
  /** Whether the verify gate runs on topic completion. */
  enabled?: boolean;
  /** Task-level cap on verify repair / re-run iterations. */
  maxIterations?: number;
  /**
   * The one-sentence acceptance requirement the user typed — the source the
   * acceptance criteria were AI-generated from. Kept so the UI can show it and
   * offer "regenerate", distinct from the resolved criteria themselves.
   */
  requirement?: string;
  /**
   * Which agent executes the verify run (the Push-model review agent). When
   * omitted, falls back to the built-in verify agent. The execution target /
   * bound device is inherited from the chosen agent's `agencyConfig`, not
   * written here.
   */
  verifierAgentId?: string;
  /** One-off ad-hoc criteria ids (references `verify_criteria.id`). */
  verifyCriteriaIds?: string[];
  /** Reuse a rubric template (references `verify_rubrics.id`). */
  verifyRubricId?: string;
}

export interface WorkspaceDocNode {
  charCount: number | null;
  createdAt: string;
  fileType: string;
  /**
   * The viewer lost access to the pinned document (e.g. it was switched back
   * to private by its owner after being pinned to a shared task). The node is
   * a tombstone — no title/metadata — and renders as a no-access placeholder.
   */
  inaccessible?: boolean;
  parentId: string | null;
  pinnedBy: string;
  sourceTaskId: string;
  sourceTaskIdentifier: string | null;
  title: string;
  updatedAt: string | null;
}

export interface WorkspaceTreeNode {
  children: WorkspaceTreeNode[];
  id: string;
}

export interface WorkspaceData {
  nodeMap: Record<string, WorkspaceDocNode>;
  tree: WorkspaceTreeNode[];
}

/**
 * Audit record of the brief-emission decision for a completed topic.
 *
 * Persisted under `taskTopics.handoff.briefDecision`. Written for *every*
 * synthesizeTopicBrief invocation (rule-conclusive and LLM-deferred alike) so
 * the emit/skip outcome is inspectable per topic.
 *
 * - source='rule' — the deterministic gate (`shouldEmitTopicBrief`) was
 *   conclusive on its own. `reason` mirrors the rule's reason string.
 * - source='llm-judge' — the rule returned 'unknown' and an LLM made the call
 *   via `chainJudgeBriefEmit`. `model` records which model voted.
 */
export interface BriefDecision {
  decidedAt: string;
  emit: boolean;
  model?: string;
  reason: string;
  source: 'rule' | 'llm-judge';
}

export interface TaskTopicHandoff {
  /**
   * Outcome of the emit-vs-skip decision for the brief on this topic. The
   * three LLM-produced fields above are agent-internal; this one is metadata
   * about the brief delivery itself, written by the lifecycle service.
   */
  briefDecision?: BriefDecision;
  /**
   * Raw last assistant message of the run, captured on completion.
   * Shown on the run card alongside the LLM-synthesized `summary` so the feed
   * surfaces the actual run output, not only the summary.
   */
  content?: string;
  keyFindings?: string[];
  nextAction?: string;
  summary?: string;
  title?: string;
}

// ── Task context (runtime state pockets stored in tasks.context JSONB) ──

export interface TaskSchedulerContext {
  // Count of consecutive automation-tick 'error' reasons since the last 'done'.
  // When it hits the fuse threshold (currently 3) we pause the task / stop
  // re-arming until the user resolves the urgent brief. Manual "run now"
  // failures do NOT touch this counter.
  consecutiveFailures?: number;
  // ISO timestamp when the latest tick was scheduled. Informational only.
  scheduledAt?: string;
  // Provider message id (or LocalScheduler scheduleId) for the next tick. Used
  // to cancel when the user wants an interval change to take effect immediately.
  tickMessageId?: string;
  // Monotonic scheduler generation. It gives each user restart / lifecycle
  // re-arm a durable identity without relying on wall-clock time or UUIDs.
  tickRevision?: number;
  // Generation token carried by the currently active tick. A delivered tick
  // must match this value so a failed best-effort cancellation cannot create
  // a second heartbeat chain.
  tickToken?: string;
}

/**
 * Durable lifecycle audit trail for a task, stored under
 * `tasks.context.lifecycle`. Unlike the live `tasks.error` column — which is
 * cleared on the next successful run so the UI only shows the *current* error —
 * this pocket is append-style history that a later success does NOT wipe. It
 * exists so "the morning check silently didn't fire" is diagnosable after the
 * fact instead of being masked by a later manual success (paused tasks were
 * silently overwritten to "scheduled" with error cleared on next success).
 */
export interface TaskLifecycleAudit {
  // Monotonic lifetime count of failed runs (never reset on success).
  errorCount?: number;
  // The most recent failure, retained even after a later success clears the
  // live `error` column.
  lastError?: {
    at: string;
    message: string;
    trigger?: TaskRunTrigger;
  };
  lastPausedAt?: string;
  // When the task was last auto-paused by the failure fuse, and why.
  lastPauseReason?: string;
  // When a successful run last cleared a prior error state (recovery marker).
  lastRecoveredAt?: string;
}

// Pointer back to the agent conversation that spawned this task via the
// `createTask` tool. Captured at creation so the task lifecycle can deliver the
// handoff result back to that session once the task completes.
export interface TaskOriginContext {
  // The agent that invoked the createTask tool (the task's creator session).
  agentId?: string;
  // The assistant message that carried the createTask tool call — the tool-call
  // anchor, sourced from the runtime's `payload.parentMessageId` (NOT the source
  // user message). A later bridge can backfill the tool message under this.
  messageId?: string;
  // The operation that was running when the task was created.
  operationId?: string;
  // The tool call id of the createTask invocation. Doubles as the dedupe key
  // for the eventual result-bridge delivery.
  toolCallId?: string;
  // The topic the creator conversation lives in — the default delivery target.
  topicId?: string;
}

export interface TaskContext {
  completion?: {
    /** The running operation that asked to complete its own task. The lifecycle
     * finalizes the task only after that operation has finished cleanly. */
    requestedByOperationId?: string;
  };
  lifecycle?: TaskLifecycleAudit;
  origin?: TaskOriginContext;
  scheduler?: TaskSchedulerContext;
}

// ── Task list item (shared between router response and client) ──

export interface TaskParticipant {
  avatar: string | null;
  backgroundColor: string | null;
  id: string;
  title: string;
  type: 'user' | 'agent';
}

export interface TaskSubtaskProgress {
  completed: number;
  total: number;
}

export interface TaskItem {
  accessedAt: Date;
  assigneeAgentId: string | null;
  assigneeLocked: boolean;
  assigneeUserId: string | null;
  assignmentMode: TaskAssignmentMode;
  automationMode: TaskAutomationMode | null;
  completedAt: Date | null;
  config: unknown;
  context: unknown;
  createdAt: Date;
  createdByAgentId: string | null;
  createdBySnapshot: TaskCreationSubjectSnapshot | null;
  createdBySubjectId: string | null;
  createdBySubjectKind: TaskCreationSubjectKind;
  createdByUserId: string | null;
  currentTopicId: string | null;
  deletedAt?: Date | null;
  description: string | null;
  domainRevision: number;
  editorData: unknown;
  error: string | null;
  executionGeneration: number;
  heartbeatInterval: number | null;
  heartbeatTimeout: number | null;
  id: string;
  identifier: string;
  instruction: string;
  isDeleted?: boolean | null;
  lastHeartbeatAt: Date | null;
  lockMetadata: Partial<Record<TaskLockField, TaskHumanLock>>;
  maxTopics: number | null;
  name: string | null;
  orchestrationOwner: TaskOrchestrationOwner;
  parentTaskId: string | null;
  policyRevision: number;
  /**
   * Kanban board ordering key (fractional indexing): lower renders earlier in
   * a column. NULL means "never dragged" — board reads fall back to
   * `-epoch(createdAt)`. Distinct from `sortOrder`, which orders subtasks
   * within their parent.
   */
  position: number | null;
  priority: number | null;
  priorityLocked: boolean;
  projectId: string | null;
  requirementLocked: boolean;
  requirementRevision: number;
  /**
   * The human accountable while the task sits in 'paused' ("pending review").
   * Stamped when a run hands off for review; the assignees stay the executors.
   */
  reviewerUserId: string | null;
  /** Expiry for the active run-generation fence, when one is present. */
  runReservationExpiresAt: Date | null;
  /** Active run-generation fence; null when no generation owns the task. */
  runReservationId: string | null;
  schedulePattern: string | null;
  scheduleTimezone: string | null;
  seq: number;
  sortOrder: number | null;
  startedAt: Date | null;
  status: string;
  /** Lightweight recursive descendant progress attached by task list reads. */
  subtaskProgress?: TaskSubtaskProgress;
  totalRunCost?: number | null;
  totalRunDuration?: number | null;
  totalTopics: number | null;
  updatedAt: Date;
  // 'private' tasks are only visible to their creator in workspace mode.
  // 'public' (default) tasks are visible to every workspace member.
  // The column is ignored in personal mode (no workspace).
  visibility: 'private' | 'public';
  workflowCategory: TaskWorkflowCategory;
  workflowLocked: boolean;
  workflowStateId: string | null;
  workspaceId: string | null;
}

export type TaskListItem = TaskItem & {
  participants: TaskParticipant[];
};

/**
 * The membership fields pinning a kanban drop to its target column, sent with
 * `task.update` anchors so the server can find the card's true neighbour past
 * the loaded page edge. Every present key constrains the column scope — a
 * `null` assignee means "the unassigned column", not "no constraint".
 */
export interface TaskMoveScope {
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  /** The column's priority value; the `priority:0` column also holds NULLs. */
  priority?: number;
  /** Legacy execution statuses represented by a business-workflow column. */
  statuses?: TaskStatus[];
  /** Business categories represented by a workflow-aware board column. */
  workflowCategories?: TaskWorkflowCategory[];
}

export interface NewTask {
  accessedAt?: Date;
  assigneeAgentId?: string | null;
  assigneeLocked?: boolean;
  assigneeUserId?: string | null;
  assignmentMode?: TaskAssignmentMode;
  automationMode?: TaskAutomationMode | null;
  completedAt?: Date | null;
  config?: unknown;
  context?: unknown;
  createdAt?: Date;
  createdByAgentId?: string | null;
  createdBySnapshot?: TaskCreationSubjectSnapshot | null;
  createdBySubjectId?: string | null;
  createdBySubjectKind?: TaskCreationSubjectKind;
  createdByUserId?: string | null;
  currentTopicId?: string | null;
  deletedAt?: Date | null;
  description?: string | null;
  domainRevision?: number;
  editorData?: unknown;
  error?: string | null;
  executionGeneration?: number;
  heartbeatInterval?: number | null;
  heartbeatTimeout?: number | null;
  id?: string;
  identifier: string;
  instruction: string;
  isDeleted?: boolean | null;
  lastHeartbeatAt?: Date | null;
  lockMetadata?: Partial<Record<TaskLockField, TaskHumanLock>>;
  maxTopics?: number | null;
  name?: string | null;
  orchestrationOwner?: TaskOrchestrationOwner;
  parentTaskId?: string | null;
  policyRevision?: number;
  position?: number | null;
  priority?: number | null;
  priorityLocked?: boolean;
  projectId?: string | null;
  requirementLocked?: boolean;
  requirementRevision?: number;
  reviewerUserId?: string | null;
  schedulePattern?: string | null;
  scheduleTimezone?: string | null;
  seq: number;
  sortOrder?: number | null;
  startedAt?: Date | null;
  status?: string;
  totalTopics?: number | null;
  updatedAt?: Date;
  visibility?: 'private' | 'public';
  workflowCategory?: TaskWorkflowCategory;
  workflowLocked?: boolean;
  workflowStateId?: string | null;
  workspaceId?: string | null;
}

// ── Task Detail (shared across CLI, viewTask tool, task.detail router) ──

export interface TaskDetailSubtaskAssignee {
  avatar: string | null;
  backgroundColor: string | null;
  id: string;
  title: string | null;
}

export interface TaskDetailSubtaskRunningTopic {
  id: string;
  operationId?: string | null;
}

export interface TaskDetailSubtask {
  assignee?: TaskDetailSubtaskAssignee | null;
  /** Human assignee (workspace member). Coexists with `assignee` (agent). */
  assigneeUserId?: string | null;
  automationMode?: TaskAutomationMode | null;
  blockedBy?: string;
  children?: TaskDetailSubtask[];
  /** Creator of the subtask; with `visibility`, gates who it can be assigned to. */
  createdByUserId?: string;
  heartbeat?: { interval?: number | null };
  identifier: string;
  name?: string | null;
  priority?: number | null;
  /** Review-phase owner once the subtask pauses for review. */
  reviewerUserId?: string | null;
  runningTopic?: TaskDetailSubtaskRunningTopic | null;
  schedule?: { pattern?: string | null; timezone?: string | null };
  status: string;
  updatedAt?: string;
  visibility?: 'private' | 'public';
}

export interface TaskDetailWorkspaceNode {
  children?: TaskDetailWorkspaceNode[];
  createdAt?: string;
  documentId: string;
  fileType?: string;
  /**
   * The viewer lost access to the pinned document (switched back to private
   * by its owner). Tombstone node — render a no-access placeholder.
   */
  inaccessible?: boolean;
  size?: number | null;
  sourceTaskId?: string;
  sourceTaskIdentifier?: string | null;
  title?: string;
}

export interface TaskDetailActivityAuthor {
  avatar?: string | null;
  id: string;
  name?: string | null;
  type: 'agent' | 'user';
  /**
   * The id is recorded but no live row backs it — deleted, or owned by someone
   * else and filtered out of this viewer's scope. Distinct from a resolved row
   * whose display name happens to be empty, and from no author at all (which
   * means the system acted). Collapsing the three misattributes history.
   */
  unresolved?: boolean;
}

export interface TaskDetailActivityAgent {
  avatar: string | null;
  backgroundColor: string | null;
  id: string;
  /** Personal name; renderers resolve the label with `agentDisplayName(agent, fallback)`. */
  name?: string | null;
  title: string | null;
}

export interface TaskDetailActivity {
  actions?: unknown;
  /** Brief-only: avatar of the agent that produced this brief; `null` when the agent is unknown or has been deleted. */
  agent?: TaskDetailActivityAgent | null;
  agentId?: string | null;
  artifacts?: BriefArtifacts | null;
  /**
   * Assignment-only: which assignee slot changed and what it moved between.
   * `null` on either side means "unassigned"; `author` carries who made the
   * change.
   */
  assignment?: {
    from?: TaskDetailActivityAuthor | null;
    kind: TaskAssignmentKind;
    to?: TaskDetailActivityAuthor | null;
  };
  author?: TaskDetailActivityAuthor;
  briefType?: string;
  /**
   * Topic-only: ISO timestamp when the topic run terminated (any of
   * completed / failed / canceled / timeout). Pair with `time` (start) to
   * compute elapsed duration.
   */
  completedAt?: string;
  content?: string;
  /** Topic-only: denormalized total run cost in USD. */
  cost?: number | null;
  createdAt?: string;
  cronJobId?: string | null;
  /** Comment-only: rich Lexical JSON state. When present, supersedes `content` for rendering. */
  editorData?: unknown;
  /** Comment-only: files attached to this comment for rendering in the UI. */
  files?: ChatFileItem[];
  id?: string;
  /**
   * Topic-only: per-run workspace-integration record mirrored from
   * `task_topics.integration`. Absent on runs that never provisioned an
   * isolated worktree — most runs have nothing to merge back.
   */
  integration?: TaskTopicIntegration | null;
  /**
   * Topic-only: persisted Gateway operation ID for the task topic, sourced
   * from `task_topics.operationId`. Survives across runs (created on add,
   * updated on resume) so it remains available after the topic completes —
   * unlike `runningOperation`, which is cleared when the run terminates.
   */
  operationId?: string | null;
  priority?: string | null;
  /**
   * Property-only: a field a person (or an agent acting for them) changed.
   * System transitions — the runner starting or finishing a run — are not
   * logged; the run row already carries them.
   */
  propertyChange?:
    | {
        field: 'automation';
        from: TaskAutomationSnapshot | null;
        to: TaskAutomationSnapshot | null;
      }
    | { field: 'priority'; from: number | null; to: number | null }
    | { field: 'status'; from: TaskStatus | null; to: TaskStatus };
  readAt?: string | null;
  resolvedAction?: string | null;
  resolvedAt?: string | null;
  resolvedComment?: string | null;
  /**
   * Topic-only: currently running Gateway operation, mirrored from
   * `topics.metadata.runningOperation`. Lets the task topic drawer establish
   * a Gateway WebSocket reconnection without a separate topic lookup.
   */
  runningOperation?: {
    assistantMessageId: string;
    heteroType?: string | null;
    operationId: string;
    scope?: string;
    threadId?: string | null;
  } | null;
  seq?: number | null;
  /** Topic-only: task that owns this run when a parent detail includes descendant topics. */
  sourceTaskId?: string | null;
  /** Topic-only: display identifier of the task that owns this run, e.g. T-12. */
  sourceTaskIdentifier?: string | null;
  /** Topic-only: display name of the task that owns this run. */
  sourceTaskName?: string | null;
  status?: string | null;
  summary?: string;
  taskId?: string | null;
  time?: string;
  title?: string;
  topicId?: string | null;
  /** Topic-only: what opened this round — `goal` marks a coordinator-started attempt. */
  trigger?: TaskRunTrigger | null;
  type: TaskActivityType;
  userId?: string | null;
  /**
   * Topic-only: the verification bound to this run. Present as soon as a
   * verify session exists — `status` is null while it is still being planned,
   * so the row can say "verifying" before there is a verdict.
   */
  verify?: TaskRunVerifySummary | null;
}

export interface TaskRunVerifySummary {
  /** The aggregate this round is chained onto — the link target. */
  acceptanceId: string | null;
  /** Checks that returned a passing verdict in this round. */
  passed: number;
  roundIndex: number | null;
  runId: string;
  status: string | null;
  /** Checks this round produced a result for; 0 while the plan is unexecuted. */
  total: number;
}

export interface TaskDetailData {
  activities?: TaskDetailActivity[];
  agentId?: string | null;
  // null/undefined = no automation configured
  automationMode?: TaskAutomationMode | null;
  checkpoint?: CheckpointConfig;
  config?: Record<string, unknown>;
  createdAt?: string;
  /** Creator of the task; used by the UI to gate creator-only actions (e.g. make private). */
  createdByUserId?: string | null;
  dependencies?: Array<{
    dependsOn: string;
    /** Raw edge target, retained so an unavailable prerequisite can be removed. */
    id?: string;
    name?: string | null;
    /** Null/omitted means unavailable, never implicitly completed. */
    status?: string | null;
    type: string;
  }>;
  description?: string | null;
  /** Rich-editor JSON state for the instruction; preserves details markdown drops (image size, etc.). */
  editorData?: unknown;
  error?: string | null;
  /** Files attached to the task instruction (persistent context for every run). */
  files?: ChatFileItem[];
  // heartbeat.interval: periodic execution interval | heartbeat.timeout+lastAt: watchdog monitoring (detects stuck tasks)
  heartbeat?: {
    interval?: number | null;
    lastAt?: string | null;
    /** When the currently pending heartbeat tick was enqueued. */
    scheduledAt?: string | null;
    timeout?: number | null;
  };
  /** Stable database identity used by subject-bound aggregates such as Acceptance. */
  id?: string;
  identifier: string;
  instruction: string;
  name?: string | null;
  parent?: { agentId?: string | null; identifier: string; name: string | null } | null;
  priority?: number | null;
  /** Owning project; drives the automation detail's project picker. */
  projectId?: string | null;
  /** The human accountable while the task sits in 'paused' ("pending review"). */
  reviewerUserId?: string | null;
  schedule?: {
    maxExecutions?: number | null;
    pattern?: string | null;
    timezone?: string | null;
  };
  /** When the current task execution started; drives live elapsed-time displays. */
  startedAt?: string;
  status: string;
  subtasks?: TaskDetailSubtask[];
  topicCount?: number;
  updatedAt?: string;
  userId?: string | null;
  /** Task Acceptance policy, exposed in the legacy TaskVerifyConfig API shape. */
  verify?: TaskVerifyConfig | null;
  /** Visibility within a workspace. 'public' is workspace-shared (default);
   *  'private' is only visible to the creator. Ignored in personal mode. */
  visibility?: 'private' | 'public';
  /** Provider workflow grouping, independent from Orvilo execution and delivery state. */
  workflowCategory?: TaskWorkflowCategory;
  /** Exact provider workflow-state identity; null means the task has no external workflow state. */
  workflowStateId?: string | null;
  workspace?: TaskDetailWorkspaceNode[];
  /** Owning workspace; null for personal (non-workspace) tasks. */
  workspaceId?: string | null;
}
