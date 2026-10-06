import type {
  AgentTier,
  AutomationOccurrenceSnapshot,
  OrviloAgentAgencyConfig,
  ProjectOrchestrationPolicy,
  TaskDispatchOrigin,
  TaskDispatchPhase,
  TaskDispatchSettlementGrant,
  TaskEventDispatchEvidence,
  TaskExecutionContractContent,
  TaskExecutionEnvironmentSnapshot,
  TaskItem,
  TaskRunTrigger,
} from '@orvilo/types';
import { executionParkedReason } from '@orvilo/types';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
  not,
  notLike,
  or,
  sql,
} from 'drizzle-orm';

import { agents } from '../schemas/agent';
import { goals } from '../schemas/goal';
import { goalNodes } from '../schemas/goalGraph';
import { mcpEventInbox, mcpEventTriggerRuns } from '../schemas/mcpEvents';
import { projectAgents, projects } from '../schemas/project';
import type { TaskDispatchItem, TaskTopicItem } from '../schemas/task';
import { taskDispatches, tasks, taskTopics } from '../schemas/task';
import { teams } from '../schemas/team';
import { topics } from '../schemas/topic';
import type { OrviloDatabase, Transaction } from '../type';
import { assertAgentUsableBy } from '../utils/agent-access';
import { snapshotAutomationDefinition } from '../utils/automationOccurrence';
import { idGenerator } from '../utils/idGenerator';
import { LinearSyncModel } from './linearSync';
import { normalizeProjectOrchestrationPolicy } from './projectOrchestrationPolicy';
import { hasActiveExecution, isExecutionParked, isParked, parkMarkerSet } from './taskExecutionSql';

const ACTIVE_PHASES: TaskDispatchPhase[] = [
  'requested',
  'claimed',
  'provisioning',
  'dispatched',
  'running',
  'waiting',
  'cancel_requested',
  'outcome_unknown',
];

const PROJECT_CONCURRENCY_PHASES: TaskDispatchPhase[] = [
  'requested',
  'claimed',
  'provisioning',
  'dispatched',
  'running',
  'cancel_requested',
  'outcome_unknown',
];

const PROVISIONABLE_PHASES: TaskDispatchPhase[] = ['requested', 'claimed'];

/** Column projection shared by the resume-sweep candidate finders. */
const resumeCandidateColumns = () => ({
  dispatchId: taskDispatches.id,
  eventEvidence: taskDispatches.eventEvidence,
  fence: taskDispatches.fence,
  generation: taskDispatches.generation,
  idempotencyKey: taskDispatches.idempotencyKey,
  phase: taskDispatches.phase,
  planRevision: taskDispatches.planRevision,
  recoveryAttempts: taskDispatches.recoveryAttempts,
  requestedBy: taskDispatches.requestedBy,
  taskId: taskDispatches.taskId,
  userId: sql<
    string | null
  >`coalesce(${projects.userId}, ${teams.createdByUserId}, ${tasks.createdByUserId}, ${tasks.createdBySubjectId})`,
  waitingReason: taskDispatches.waitingReason,
  workspaceId: taskDispatches.workspaceId,
});

const resumeCandidates = (
  rows: Array<Omit<TaskDispatchResumeCandidate, 'userId'> & { userId: string | null }>,
): TaskDispatchResumeCandidate[] =>
  rows.flatMap((row) => (row.userId === null ? [] : [{ ...row, userId: row.userId }]));

/**
 * Goal statuses that fence automated dispatch for a goal-owned Task. Pausing,
 * canceling or finishing a goal is the stop boundary for every not-yet-running
 * dispatch behind its nodes: nothing queued may execute while the stop stands.
 * 'planning'/'verifying'/'review' keep dispatching — a goal still driving its
 * plan or its acceptance needs its own recovery/corrective runs.
 */
const GOAL_DISPATCH_BLOCKED_STATUSES = ['paused', 'canceled', 'failed', 'achieved'] as const;

export const matchesDispatchAssignee = (task: TaskItem, dispatch: TaskDispatchItem) =>
  task.assigneeAgentId === dispatch.agentId ||
  (dispatch.agentId !== null &&
    dispatch.requestedBy.startsWith('manual:') &&
    task.assigneeAgentId === null &&
    task.assigneeUserId !== null &&
    task.assignmentMode === 'manual' &&
    task.orchestrationOwner === 'manual' &&
    task.createdBySubjectKind !== 'integration' &&
    task.createdBySubjectKind !== 'system');

export class TaskDispatchNotFoundError extends Error {}
export class TaskDispatchIdempotencyConflictError extends Error {}

/**
 * An `internal` claim whose persisted settlement grant no longer verifies
 * against the current task state — stale source generation, lapsed
 * deadline, wrong workspace, or a reservation that expired before the claim.
 * The claim is refused, never silently downgraded to another origin.
 */
export class TaskDispatchSettlementGrantError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Settlement grant rejected: ${reason}`);
    this.name = 'TaskDispatchSettlementGrantError';
    this.reason = reason;
  }
}

/** Denial codes mirror DispatchAdmissionErrorCode in @orvilo/agent-execution. */
export type EventDispatchEvidenceCode =
  | 'stale-binding'
  | 'revoked'
  | 'tenant-mismatch'
  | 'loop'
  | 'admission-held'
  | 'runtime-unavailable'
  | 'idempotency-conflict'
  | 'invalid-event';

/**
 * Persisted event-admission evidence an `event`-triggered claim must cite.
 * The trigger run, trigger, binding, inbox row, connector and saved scope
 * are all re-verified under the same task lock that mints the dispatch —
 * verify association, never marker presence.
 */
export type EventDispatchEvidence = TaskEventDispatchEvidence;

/**
 * An `event` claim whose cited evidence no longer verifies — stale trigger
 * revision, settled or missing receipt, lost lease, revoked subscription,
 * dead connector, drifted scope, or a causation loop. The claim is refused
 * like a stale settlement grant, never silently downgraded to another origin.
 */
export class TaskDispatchEventEvidenceError extends Error {
  readonly code: EventDispatchEvidenceCode;

  constructor(code: EventDispatchEvidenceCode, message: string) {
    super(message);
    this.name = 'TaskDispatchEventEvidenceError';
    this.code = code;
  }
}

export interface RequestTaskDispatchInput {
  /** Validated delegation executor; otherwise use the locked task assignee. */
  delegatedAgentId?: string;
  dispatchId?: string;
  /** Server-verified admission evidence for `trigger: 'event'` rows. */
  eventEvidence?: EventDispatchEvidence;
  /** Runner identity for fresh execution authorization, separate from audit actors. */
  executionUserId?: string;
  expectedDefinitionVersionId?: string;
  idempotencyKey: string;
  /** Raw actor identity persisted separately from the `trigger:actor`
   *  `requestedBy` audit string (SA05-B). */
  initiator?: string;
  /**
   * Authoritative execution origin persisted on the row — resolved
   *  server-side from verified settlement evidence, not caller-supplied
   *  marker presence. First write wins: idempotent retries never relabel.
   */
  origin?: TaskDispatchOrigin;
  planRevision?: number | null;
  requestedBy: string;
  /** Server-verified settlement evidence for `origin: 'internal'` rows. */
  settlementGrant?: TaskDispatchSettlementGrant;
  sourceDispatchId?: string;
  taskId: string;
  trigger: TaskRunTrigger;
}

export type RequestTaskDispatchResult =
  | { dispatch: TaskDispatchItem; state: 'created' | 'existing'; task: TaskItem }
  | { active: TaskDispatchItem; state: 'busy'; task: TaskItem };

export interface TaskDispatchLease {
  dispatch: TaskDispatchItem;
  fence: number;
}

export interface TaskCancellationClaim extends TaskDispatchLease {
  topic?: TaskTopicItem;
}

export interface TaskCancellationCandidate {
  dispatchId: string;
  workspaceId: string | null;
}

export interface TaskDispatchRecoveryClaim extends TaskDispatchLease {
  task: TaskItem;
  topic?: TaskTopicItem;
}

export interface TaskDispatchRecoveryCandidate {
  dispatchId: string;
  workspaceId: string | null;
}

export interface TaskPlanningDispatchCandidate {
  dispatchId: string;
  idempotencyKey: string;
  planRevision: number;
  requestedBy: string;
  taskId: string;
  userId: string;
  workspaceId: string | null;
}

/**
 * A resumable durable intent discovered by the resume sweep — either a
 * start that never reached provisioning (`requested`/`claimed`) or a parked
 * `waiting` row whose recorded reason a re-evaluation can clear. The resume
 * service re-drives these through the same `request()` path so contract,
 * policy and goal re-checks decide whether the row resumes or re-parks.
 */
export interface TaskDispatchResumeCandidate {
  dispatchId: string;
  eventEvidence?: TaskEventDispatchEvidence | null;
  fence: number;
  generation: number;
  idempotencyKey: string;
  phase: TaskDispatchPhase;
  planRevision: number | null;
  recoveryAttempts: number;
  requestedBy: string;
  taskId: string;
  userId: string;
  waitingReason: string | null;
  workspaceId: string | null;
}

/** A `backlog` task eligible for project `autoDispatch` intake. */
export interface TaskBacklogIntakeCandidate {
  assigneeAgentId: string | null;
  createdBySubjectId: string | null;
  createdByUserId: string | null;
  executionGeneration: number;
  orchestrationPolicy: ProjectOrchestrationPolicy;
  priority: number | null;
  projectId: string;
  taskId: string;
  userId: string | null;
  workspaceId: string;
}

/** The latest terminally settled dispatch for a task, used for tier escalation. */
export interface TaskTerminalDispatchOutcome {
  agentId: string | null;
  generation: number;
  phase: TaskDispatchPhase;
  requestedBy: string;
  tier: AgentTier | null;
}

/** A tiered roster row the intake matcher may route a task onto. */
export interface ProjectAgentRosterEntry {
  agencyConfig: OrviloAgentAgencyConfig | null;
  agentId: string;
  model: string | null;
  role: string | null;
  sortOrder: number;
  tier: AgentTier | null;
}

/**
 * Durable arbiter for Task execution. Every automated entry point must request
 * a dispatch before provisioning an environment or calling the agent runtime.
 * The Task row lock serializes generation changes; the partial unique index is
 * the database-level backstop against a second active owner.
 */
export class TaskDispatchModel {
  constructor(
    private readonly db: OrviloDatabase,
    private readonly workspaceId?: string,
  ) {}

  private scopeCondition() {
    return this.workspaceId
      ? eq(taskDispatches.workspaceId, this.workspaceId)
      : isNull(taskDispatches.workspaceId);
  }

  private assertIdempotencyTarget(existing: TaskDispatchItem, taskId: string) {
    if (existing.taskId !== taskId) {
      throw new TaskDispatchIdempotencyConflictError(
        `Idempotency key already belongs to Task ${existing.taskId}`,
      );
    }
  }

  /**
   * Capability band the task's bound agent holds on the project roster — the
   * snapshot persisted as `task_dispatches.tier` so a later roster edit cannot
   * rewrite which tier an attempt ran at. Non-project tasks and agents absent
   * from the roster have no band.
   */
  private async projectAgentTier(
    db: OrviloDatabase,
    projectId: string | null,
    agentId: string | null,
  ): Promise<AgentTier | null> {
    if (!projectId || !agentId) return null;
    const [row] = await db
      .select({ tier: projectAgents.tier })
      .from(projectAgents)
      .where(
        and(
          eq(projectAgents.projectId, projectId),
          eq(projectAgents.agentId, agentId),
          this.workspaceId
            ? eq(projectAgents.workspaceId, this.workspaceId)
            : isNull(projectAgents.workspaceId),
        ),
      )
      .limit(1);
    return row?.tier ?? null;
  }

  private async projectDispatchWaitingReason(
    db: OrviloDatabase,
    task: TaskItem,
    trigger: TaskRunTrigger,
    excludeDispatchId?: string,
  ): Promise<string | null> {
    const appliesProjectPolicy =
      trigger === 'orchestrator' ||
      trigger === 'schedule' ||
      trigger === 'heartbeat' ||
      trigger === 'event';
    if (!appliesProjectPolicy || !task.projectId || !this.workspaceId) return null;

    const [project] = await db
      .select({ orchestrationPolicy: projects.orchestrationPolicy })
      .from(projects)
      .where(and(eq(projects.id, task.projectId), eq(projects.workspaceId, this.workspaceId)))
      .for('update')
      .limit(1);
    if (!project) return 'project_policy_unavailable';

    const policy = normalizeProjectOrchestrationPolicy(project.orchestrationPolicy);
    if (!policy.autoDispatch) return 'project_auto_dispatch_disabled';
    if (!task.assigneeAgentId) return null;

    const [participant] = await db
      .select({ enabled: projectAgents.enabled, role: projectAgents.role })
      .from(projectAgents)
      .where(
        and(
          eq(projectAgents.projectId, task.projectId),
          eq(projectAgents.agentId, task.assigneeAgentId),
          eq(projectAgents.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    if (!participant?.enabled) return 'project_agent_not_enabled';
    if (policy.allowedAgentIds?.length && !policy.allowedAgentIds.includes(task.assigneeAgentId)) {
      return 'project_agent_not_allowed';
    }
    if (
      policy.allowedRoles?.length &&
      (!participant.role || !policy.allowedRoles.includes(participant.role))
    ) {
      return 'project_agent_role_not_allowed';
    }

    if (policy.concurrencyLimit !== undefined) {
      const [active] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(taskDispatches)
        .where(
          and(
            eq(taskDispatches.workspaceId, this.workspaceId),
            eq(taskDispatches.projectId, task.projectId),
            inArray(taskDispatches.phase, PROJECT_CONCURRENCY_PHASES),
            excludeDispatchId ? ne(taskDispatches.id, excludeDispatchId) : undefined,
          ),
        );
      if (Number(active?.count ?? 0) >= policy.concurrencyLimit) {
        return 'project_concurrency_limit';
      }
    }

    const maxRuns = policy.executionBudget?.maxRuns;
    const maxCost = policy.executionBudget?.maxCost;
    if (maxRuns !== undefined || maxCost !== undefined) {
      const [spend] = await db
        .select({
          runs: sql<number>`count(${taskTopics.id})::int`,
          totalCost: sql<string>`coalesce(sum(${topics.totalCost}), 0)`,
        })
        .from(taskTopics)
        .innerJoin(tasks, eq(taskTopics.taskId, tasks.id))
        .leftJoin(topics, eq(taskTopics.topicId, topics.id))
        .where(and(eq(tasks.workspaceId, this.workspaceId), eq(tasks.projectId, task.projectId)));
      if (maxRuns !== undefined && Number(spend?.runs ?? 0) >= maxRuns) {
        return 'project_run_budget_exhausted';
      }
      if (maxCost !== undefined && Number(spend?.totalCost ?? 0) >= maxCost) {
        return 'project_cost_budget_exhausted';
      }
    }

    return null;
  }

  /**
   * Automated dispatch on a Task owned by a stopped goal must not proceed:
   * pausing/canceling the goal is the stop-intent boundary, and a queued
   * dispatch resuming through a stray trigger would restart paid work the user
   * already stopped. Returns `goal_<status>` when a blocking owner exists —
   * the reason doubles as the durable `waitingReason`, resumable by the next
   * request once the goal runs again. A 'manual' trigger is the user's own act
   * on the Task and bypasses this gate, the same way it bypasses project
   * policy.
   */
  private async goalDispatchWaitingReason(
    db: OrviloDatabase,
    task: TaskItem,
    trigger: TaskRunTrigger,
  ): Promise<string | null> {
    if (trigger === 'manual') return null;
    const [blocked] = await db
      .select({ status: goals.status })
      .from(goalNodes)
      .innerJoin(goals, eq(goalNodes.goalId, goals.id))
      .where(
        and(
          eq(goalNodes.taskId, task.id),
          inArray(goals.status, [...GOAL_DISPATCH_BLOCKED_STATUSES]),
        ),
      )
      .limit(1);
    return blocked ? `goal_${blocked.status}` : null;
  }

  /**
   * Discover durable stop intents whose worker lease is available. The global
   * watchdog uses this read-only scan, then each workspace-scoped model claims
   * one row with compare-and-set before doing any remote interruption.
   */
  static async findCancellationCandidates(
    db: OrviloDatabase,
    input: { limit?: number; now?: Date } = {},
  ): Promise<TaskCancellationCandidate[]> {
    const now = input.now ?? new Date();
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
    return db
      .select({ dispatchId: taskDispatches.id, workspaceId: taskDispatches.workspaceId })
      .from(taskDispatches)
      .where(
        and(
          eq(taskDispatches.phase, 'cancel_requested'),
          or(isNull(taskDispatches.leaseExpiresAt), lt(taskDispatches.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(taskDispatches.updatedAt), asc(taskDispatches.id))
      .limit(limit);
  }

  /** Discover expired execution leases that must be reconciled by stable operation identity. */
  static async findRecoveryCandidates(
    db: OrviloDatabase,
    input: { limit?: number; now?: Date } = {},
  ): Promise<TaskDispatchRecoveryCandidate[]> {
    const now = input.now ?? new Date();
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
    return db
      .select({ dispatchId: taskDispatches.id, workspaceId: taskDispatches.workspaceId })
      .from(taskDispatches)
      .where(
        and(
          inArray(taskDispatches.phase, [
            'provisioning',
            'dispatched',
            'running',
            'outcome_unknown',
          ]),
          or(isNull(taskDispatches.leaseExpiresAt), lt(taskDispatches.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(taskDispatches.updatedAt), asc(taskDispatches.id))
      .limit(limit);
  }

  /**
   * Discover durable start intents that never reached provisioning — a
   * `requested` row no worker ever claimed, or a `claimed` row whose worker
   * lease lapsed before the environment started. Planner intents are owned
   * by their dedicated sweep and excluded here. Event intents are re-driven
   * with their stored evidence, re-verified at the shared admission boundary.
   * Legacy rows without evidence are retired rather than reconstructed.
   */
  static async findStaleStartCandidates(
    db: OrviloDatabase,
    input: { graceMs?: number; limit?: number; now?: Date } = {},
  ): Promise<TaskDispatchResumeCandidate[]> {
    const now = input.now ?? new Date();
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
    const staleBefore = new Date(now.getTime() - (input.graceMs ?? 5 * 60 * 1000));
    const rows = await db
      .select(resumeCandidateColumns())
      .from(taskDispatches)
      .innerJoin(tasks, eq(tasks.id, taskDispatches.taskId))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(teams, eq(teams.id, tasks.teamId))
      .where(
        and(
          inArray(taskDispatches.phase, ['requested', 'claimed']),
          lt(taskDispatches.updatedAt, staleBefore),
          or(isNull(taskDispatches.leaseExpiresAt), lt(taskDispatches.leaseExpiresAt, now)),
          notLike(taskDispatches.requestedBy, 'orchestrator:planning:%'),
        ),
      )
      .orderBy(asc(taskDispatches.updatedAt), asc(taskDispatches.id))
      .limit(limit);
    return resumeCandidates(rows);
  }

  /**
   * Discover parked `waiting` dispatches whose recorded reason a
   * re-evaluation may clear — capacity/budget ceilings, a newly assigned
   * agent, a resumed admission flag, a retryable prepare failure. Reasons
   * owned by another sweep (`goal_*`), event intents without stored evidence,
   * planner intents, and terminal-coded waits are skipped.
   */
  static async findWaitingResumeCandidates(
    db: OrviloDatabase,
    input: { graceMs?: number; limit?: number; now?: Date } = {},
  ): Promise<TaskDispatchResumeCandidate[]> {
    const now = input.now ?? new Date();
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
    const staleBefore = new Date(now.getTime() - (input.graceMs ?? 5 * 60 * 1000));
    const rows = await db
      .select(resumeCandidateColumns())
      .from(taskDispatches)
      .innerJoin(tasks, eq(tasks.id, taskDispatches.taskId))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(teams, eq(teams.id, tasks.teamId))
      .where(
        and(
          eq(taskDispatches.phase, 'waiting'),
          lt(taskDispatches.updatedAt, staleBefore),
          or(isNull(taskDispatches.leaseExpiresAt), lt(taskDispatches.leaseExpiresAt, now)),
          or(
            notLike(taskDispatches.requestedBy, 'event:%'),
            isNotNull(taskDispatches.eventEvidence),
          ),
          notLike(taskDispatches.requestedBy, 'orchestrator:planning:%'),
          or(
            isNull(taskDispatches.waitingReason),
            and(
              notLike(taskDispatches.waitingReason, 'goal_%'),
              notLike(taskDispatches.waitingReason, 'superseded_%'),
              notLike(taskDispatches.waitingReason, 'settlement_%'),
              ne(taskDispatches.waitingReason, 'planning_resume_instruction_missing'),
            ),
          ),
        ),
      )
      .orderBy(asc(taskDispatches.updatedAt), asc(taskDispatches.id))
      .limit(limit);
    return resumeCandidates(rows);
  }

  /**
   * Discover `backlog` tasks a project has opted into autonomous dispatch
   * for (`orchestrationPolicy.autoDispatch`): assigned, not automation-owned
   * (heartbeat/schedule tasks mint their own tick intents), not deleted, and
   * without a live dispatch. Dependency readiness is checked by the service
   * in the caller's owner scope before each start.
   */
  static async findBacklogIntakeCandidates(
    db: OrviloDatabase,
    input: { limit?: number } = {},
  ): Promise<TaskBacklogIntakeCandidate[]> {
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 10)));
    const rows = await db
      .select({
        assigneeAgentId: tasks.assigneeAgentId,
        createdBySubjectId: tasks.createdBySubjectId,
        createdByUserId: tasks.createdByUserId,
        executionGeneration: tasks.executionGeneration,
        orchestrationPolicy: projects.orchestrationPolicy,
        priority: tasks.priority,
        // The join keys on the project, so the column is always present here.
        projectId: sql<string>`${tasks.projectId}`,
        taskId: tasks.id,
        userId: sql<string | null>`coalesce(${tasks.createdByUserId}, ${tasks.createdBySubjectId})`,
        workspaceId: tasks.workspaceId,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.workflowCategory, 'backlog'),
          sql`NOT ${isParked}`,
          isNotNull(tasks.workspaceId),
          isNotNull(tasks.assigneeAgentId),
          isNull(tasks.automationMode),
          sql`${tasks.isDeleted} IS NOT TRUE`,
          sql`(${projects.orchestrationPolicy} ->> 'autoDispatch')::boolean`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${taskDispatches} active
            WHERE active.task_id = ${tasks.id}
              AND active.phase IN ('requested', 'claimed', 'provisioning', 'dispatched', 'running', 'waiting', 'cancel_requested', 'outcome_unknown')
          )`,
        ),
      )
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(limit);
    return rows.flatMap((row) =>
      row.userId === null || row.workspaceId === null
        ? []
        : [{ ...row, userId: row.userId, workspaceId: row.workspaceId }],
    );
  }

  /**
   * The task's most recent terminally settled dispatch — the durable outcome
   * the tiered orchestrator escalates from. `generation` is minted under the
   * task row lock, so it orders attempts strictly within a task.
   */
  static async findLatestTerminalDispatch(
    db: OrviloDatabase,
    input: { taskId: string; workspaceId: string | null },
  ): Promise<TaskTerminalDispatchOutcome | undefined> {
    const [row] = await db
      .select({
        agentId: taskDispatches.agentId,
        generation: taskDispatches.generation,
        phase: taskDispatches.phase,
        requestedBy: taskDispatches.requestedBy,
        tier: taskDispatches.tier,
      })
      .from(taskDispatches)
      .where(
        and(
          eq(taskDispatches.taskId, input.taskId),
          input.workspaceId
            ? eq(taskDispatches.workspaceId, input.workspaceId)
            : isNull(taskDispatches.workspaceId),
          inArray(taskDispatches.phase, ['canceled', 'failed', 'succeeded', 'abandoned']),
        ),
      )
      .orderBy(desc(taskDispatches.generation))
      .limit(1);
    return row;
  }

  /**
   * The enabled roster rows a tiered intake may route work onto, in roster
   * order (`sortOrder`, then insertion) so cheap-first matching is stable.
   */
  static async listProjectAgentRoster(
    db: OrviloDatabase,
    input: { projectId: string; workspaceId: string | null },
  ): Promise<ProjectAgentRosterEntry[]> {
    return db
      .select({
        agencyConfig: agents.agencyConfig,
        agentId: projectAgents.agentId,
        model: agents.model,
        role: projectAgents.role,
        sortOrder: projectAgents.sortOrder,
        tier: projectAgents.tier,
      })
      .from(projectAgents)
      .innerJoin(agents, eq(agents.id, projectAgents.agentId))
      .where(
        and(
          eq(projectAgents.projectId, input.projectId),
          eq(projectAgents.enabled, true),
          input.workspaceId
            ? eq(projectAgents.workspaceId, input.workspaceId)
            : isNull(projectAgents.workspaceId),
        ),
      )
      .orderBy(asc(projectAgents.sortOrder), asc(projectAgents.createdAt));
  }

  /** Discover committed planner dispatch intents whose post-commit wakeup was lost. */
  static async findPlanningStartCandidates(
    db: OrviloDatabase,
    input: { limit?: number } = {},
  ): Promise<TaskPlanningDispatchCandidate[]> {
    const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
    const rows = await db
      .select({
        dispatchId: taskDispatches.id,
        idempotencyKey: taskDispatches.idempotencyKey,
        planRevision: taskDispatches.planRevision,
        requestedBy: taskDispatches.requestedBy,
        taskId: taskDispatches.taskId,
        userId: sql<string | null>`coalesce(${projects.userId}, ${teams.createdByUserId})`,
        workspaceId: taskDispatches.workspaceId,
      })
      .from(taskDispatches)
      .innerJoin(tasks, eq(tasks.id, taskDispatches.taskId))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(teams, eq(teams.id, tasks.teamId))
      .where(
        and(
          eq(taskDispatches.phase, 'requested'),
          isNotNull(taskDispatches.planRevision),
          isNotNull(taskDispatches.workspaceId),
          like(taskDispatches.requestedBy, 'orchestrator:planning:%'),
        ),
      )
      .orderBy(asc(taskDispatches.updatedAt), asc(taskDispatches.id))
      .limit(limit);
    return rows.flatMap((row) =>
      row.planRevision === null || row.userId === null
        ? []
        : [{ ...row, planRevision: row.planRevision, userId: row.userId }],
    );
  }

  /**
   * Fence every active dispatch behind a set of tasks in one statement —
   * the bulk counterpart of `requestStop` for ownership-detach paths (agent
   * ownership transfer, goal reassignment) that clear an assignee out from
   * under live executions. The watchdog's cancellation sweep then performs
   * the per-row interrupt + settle so the remote writers are provably dead,
   * not just fenced in the database.
   */
  static async requestStopForTasks(
    db: OrviloDatabase,
    taskIds: string[],
    reason: string,
  ): Promise<number> {
    if (taskIds.length === 0) return 0;
    const updated = await db
      .update(taskDispatches)
      .set({
        cancelAttempts: 0,
        cancelRequestedAt: new Date(),
        fence: sql`${taskDispatches.fence} + 1`,
        lastCancelError: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        phase: 'cancel_requested',
        waitingReason: reason,
      })
      .where(
        and(
          inArray(taskDispatches.taskId, taskIds),
          inArray(taskDispatches.phase, [
            'requested',
            'claimed',
            'provisioning',
            'dispatched',
            'running',
            'waiting',
            'outcome_unknown',
          ]),
        ),
      )
      .returning({ id: taskDispatches.id });
    return updated.length;
  }

  async request(input: RequestTaskDispatchInput): Promise<RequestTaskDispatchResult> {
    return this.db.transaction(async (tx) => {
      const [task] = await tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, input.taskId))
        .limit(1)
        .for('update');
      if (!task || task.workspaceId !== (this.workspaceId ?? null)) {
        throw new TaskDispatchNotFoundError('Task not found in dispatch scope');
      }

      const executingAgentId = input.delegatedAgentId ?? task.assigneeAgentId;
      if (input.executionUserId && executingAgentId) {
        await assertAgentUsableBy(tx as OrviloDatabase, executingAgentId, {
          userId: input.executionUserId,
          workspaceId: this.workspaceId,
        });
      }

      // The roster band the bound agent runs at — snapshotted once under the
      // task lock so every agentId write below records the tier the attempt
      // was made at (the escalation signal for the next dispatch).
      const attemptedTier = await this.projectAgentTier(tx, task.projectId, task.assigneeAgentId);

      // Resolve idempotency only after locking the Task. Besides serializing
      // concurrent retries, this makes the assignee and revision snapshots
      // below authoritative for the exact dispatch we are about to claim.
      const [existing] = await tx
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.idempotencyKey, input.idempotencyKey), this.scopeCondition()))
        .limit(1);
      if (existing) {
        this.assertIdempotencyTarget(existing, input.taskId);
        if (input.trigger === 'event') {
          const invalid = await this.verifyEventEvidence(
            tx,
            task,
            existing.eventEvidence ?? input.eventEvidence,
            existing.id,
          );
          if (invalid) throw invalid;
        }
        let resumedWaitingReason: string | null | undefined;
        if (
          existing.phase === 'waiting' &&
          input.trigger !== 'manual' &&
          input.trigger !== 'goal' &&
          task.projectId
        ) {
          resumedWaitingReason = await this.projectDispatchWaitingReason(
            tx,
            task,
            input.trigger,
            existing.id,
          );
          if (!resumedWaitingReason && !task.assigneeAgentId) {
            resumedWaitingReason = 'no_eligible_agent';
          }
          if (resumedWaitingReason) {
            const [waiting] = await tx
              .update(taskDispatches)
              .set({ waitingReason: resumedWaitingReason })
              .where(and(eq(taskDispatches.id, existing.id), eq(taskDispatches.phase, 'waiting')))
              .returning();
            return { dispatch: waiting ?? existing, state: 'existing' as const, task };
          }
        }
        // A goal stop fences queued dispatches too: when project policy passes
        // (or does not apply), a waiting row still must not resume while an
        // owning goal is paused/canceled/done.
        if (!resumedWaitingReason && existing.phase === 'waiting' && input.trigger !== 'manual') {
          const goalWaitingReason = await this.goalDispatchWaitingReason(tx, task, input.trigger);
          if (goalWaitingReason) {
            const [waiting] = await tx
              .update(taskDispatches)
              .set({ waitingReason: goalWaitingReason })
              .where(and(eq(taskDispatches.id, existing.id), eq(taskDispatches.phase, 'waiting')))
              .returning();
            return { dispatch: waiting ?? existing, state: 'existing' as const, task };
          }
        }
        if (
          existing.phase === 'waiting' &&
          task.assigneeAgentId &&
          (existing.waitingReason === 'no_eligible_agent' ||
            existing.waitingReason === 'goal_paused' ||
            // `caid_dispatch_disabled` resumes optimistically — the service
            // layer re-checks the admission flag after request() returns and
            // re-parks the row if rollout is still off.
            existing.waitingReason === 'caid_dispatch_disabled' ||
            // A retryable prepare-stage failure (provisioning, prompt build,
            // registration) parks the row here; the same idempotency key
            // resumes it so the bound approval re-enters via adopt.
            existing.waitingReason === 'dispatch_prepare_retryable' ||
            resumedWaitingReason === null)
        ) {
          const [resumed] = await tx
            .update(taskDispatches)
            .set({
              agentId: task.assigneeAgentId,
              phase: 'requested',
              planRevision: input.planRevision,
              policyRevision: task.policyRevision,
              recoveryAttempts: 0,
              requirementRevision: task.requirementRevision,
              taskRevision: task.domainRevision,
              tier: attemptedTier,
              waitingReason: null,
            })
            .where(and(eq(taskDispatches.id, existing.id), eq(taskDispatches.phase, 'waiting')))
            .returning();
          return { dispatch: resumed ?? existing, state: 'existing' as const, task };
        }
        return { dispatch: existing, state: 'existing' as const, task };
      }

      if (
        input.expectedDefinitionVersionId &&
        snapshotAutomationDefinition(task).definitionVersionId !== input.expectedDefinitionVersionId
      ) {
        throw new TaskDispatchIdempotencyConflictError(
          'Automation definition changed before occurrence publication',
        );
      }

      const [active] = await tx
        .select()
        .from(taskDispatches)
        .where(
          and(eq(taskDispatches.taskId, task.id), inArray(taskDispatches.phase, ACTIVE_PHASES)),
        )
        .limit(1)
        .for('update');
      if (
        active?.phase === 'waiting' &&
        !active.automationOccurrence &&
        !['event', 'schedule', 'heartbeat'].includes(input.trigger)
      ) {
        const requestedTrigger = active.requestedBy.split(':', 1)[0];
        const activeTrigger = (
          ['event', 'goal', 'heartbeat', 'manual', 'orchestrator', 'schedule'] as const
        ).includes(requestedTrigger as TaskRunTrigger)
          ? (requestedTrigger as TaskRunTrigger)
          : input.trigger;
        const policyWaitingReason = await this.projectDispatchWaitingReason(
          tx,
          task,
          activeTrigger,
          active.id,
        );
        const waitingReason =
          policyWaitingReason ??
          (await this.goalDispatchWaitingReason(tx, task, activeTrigger)) ??
          (task.assigneeAgentId ? null : 'no_eligible_agent');
        if (waitingReason) {
          const [waiting] = await tx
            .update(taskDispatches)
            .set({ waitingReason })
            .where(and(eq(taskDispatches.id, active.id), eq(taskDispatches.phase, 'waiting')))
            .returning();
          return { dispatch: waiting ?? active, state: 'existing' as const, task };
        }
        const [resumed] = await tx
          .update(taskDispatches)
          .set({
            agentId: task.assigneeAgentId,
            phase: 'requested',
            policyRevision: task.policyRevision,
            recoveryAttempts: 0,
            requirementRevision: task.requirementRevision,
            taskRevision: task.domainRevision,
            tier: attemptedTier,
            waitingReason: null,
          })
          .where(and(eq(taskDispatches.id, active.id), eq(taskDispatches.phase, 'waiting')))
          .returning();
        return { dispatch: resumed ?? active, state: 'existing' as const, task };
      }
      if (active) return { active, state: 'busy' as const, task };

      // Persisted-claim verification (SB09): an `internal` row exists only
      // while its grant is current and bounded — verify under the same task
      // lock that mints the claim so a grant cannot be persisted past the
      // state it was minted on.
      if (input.origin === 'internal') {
        const settlementStale = await this.verifySettlementGrant(tx, task, {
          expectedSourceGeneration: task.executionGeneration,
          grant: input.settlementGrant,
        });
        if (settlementStale) throw new TaskDispatchSettlementGrantError(settlementStale);
      }

      // Persisted-claim verification for `event` writers: the durable
      // trigger run, trigger, subscription binding, inbox lease and saved
      // ownership scope must all still match under the task lock that mints
      // the dispatch — a bare `event` trigger string is never evidence.
      if (input.trigger === 'event') {
        const evidenceStale = await this.verifyEventEvidence(tx, task, input.eventEvidence);
        if (evidenceStale) throw evidenceStale;
      }

      let automationOccurrence: AutomationOccurrenceSnapshot | undefined;
      if (input.trigger === 'event') {
        const evidence = input.eventEvidence!;
        const [savedRun] = await tx
          .select()
          .from(mcpEventTriggerRuns)
          .where(eq(mcpEventTriggerRuns.id, evidence.triggerRunId))
          .limit(1);
        const [inbox] = await tx
          .select()
          .from(mcpEventInbox)
          .where(eq(mcpEventInbox.id, evidence.inboxRef))
          .limit(1);
        if (!inbox || !savedRun)
          throw new TaskDispatchEventEvidenceError('invalid-event', 'Event input missing');
        automationOccurrence = savedRun.automationOccurrence ?? {
          definition: snapshotAutomationDefinition(task),
          occurrenceId: savedRun.id,
          input: {
            data: inbox.delivery.event.data,
            eventId: inbox.eventId,
            eventType: inbox.delivery.event.name,
            inputHash: inbox.payloadHash,
            inputRef: inbox.id,
            receivedAt: new Date(inbox.receivedAt).toISOString(),
            source: inbox.connectorId,
          },
        };
        await tx
          .update(mcpEventTriggerRuns)
          .set({ automationOccurrence })
          .where(eq(mcpEventTriggerRuns.id, savedRun.id));
      } else if (input.trigger === 'schedule' || input.trigger === 'heartbeat') {
        automationOccurrence = {
          definition: snapshotAutomationDefinition(task),
          occurrenceId: input.idempotencyKey,
        };
      }
      if (
        automationOccurrence &&
        automationOccurrence.definition.assigneeAgentId !== task.assigneeAgentId
      ) {
        throw new TaskDispatchEventEvidenceError(
          'revoked',
          'Automation execution identity changed',
        );
      }

      const waitingReason =
        (await this.projectDispatchWaitingReason(tx, task, input.trigger)) ??
        (await this.goalDispatchWaitingReason(tx, task, input.trigger));
      const generation = task.executionGeneration + 1;
      const [dispatch] = await tx
        .insert(taskDispatches)
        .values({
          agentId: task.assigneeAgentId,
          automationOccurrence: automationOccurrence ?? null,
          eventEvidence: input.eventEvidence ?? null,
          generation,
          id: input.dispatchId ?? idGenerator('taskDispatches'),
          idempotencyKey: input.idempotencyKey,
          initiator: input.initiator ?? null,
          origin: input.origin ?? null,
          phase: waitingReason ? 'waiting' : 'requested',
          planRevision: input.planRevision,
          policyRevision: task.policyRevision,
          projectId: task.projectId,
          requestedBy: `${input.trigger}:${input.requestedBy}`,
          requirementRevision: task.requirementRevision,
          settlementGrant: input.settlementGrant ?? null,
          sourceDispatchId: input.sourceDispatchId ?? null,
          taskId: task.id,
          taskRevision: task.domainRevision,
          tier: attemptedTier,
          waitingReason,
          workspaceId: task.workspaceId,
        })
        .returning();

      await tx.update(tasks).set({ executionGeneration: generation }).where(eq(tasks.id, task.id));

      return { dispatch, state: 'created' as const, task };
    });
  }

  /** First prompt freeze wins; retries cannot replace input or policy. */
  async freezeAutomationContent(input: {
    dispatchId: string;
    owner: string;
    fence: number;
    content: TaskExecutionContractContent;
    fileIds: string[];
  }): Promise<AutomationOccurrenceSnapshot | null> {
    return this.db.transaction(async (tx) => {
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(
          and(
            eq(taskDispatches.id, input.dispatchId),
            this.scopeCondition(),
            eq(taskDispatches.leaseOwner, input.owner),
            eq(taskDispatches.fence, input.fence),
            inArray(taskDispatches.phase, ['claimed', 'provisioning']),
            gt(taskDispatches.leaseExpiresAt, new Date()),
          ),
        )
        .for('update')
        .limit(1);
      if (!dispatch?.automationOccurrence) return null;
      if (dispatch.automationOccurrence.content) return dispatch.automationOccurrence;
      const snapshot = {
        ...dispatch.automationOccurrence,
        content: input.content,
        fileIds: input.fileIds,
      };
      await tx
        .update(taskDispatches)
        .set({ automationOccurrence: snapshot })
        .where(eq(taskDispatches.id, dispatch.id));
      return snapshot;
    });
  }

  async claimForProvisioning(
    dispatchId: string,
    owner: string,
    leaseMs: number,
  ): Promise<TaskDispatchLease | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.id, dispatchId), this.scopeCondition()))
        .limit(1)
        .for('update');
      if (!dispatch || !PROVISIONABLE_PHASES.includes(dispatch.phase)) return null;
      if (
        dispatch.leaseOwner !== owner &&
        dispatch.leaseExpiresAt &&
        dispatch.leaseExpiresAt >= now
      ) {
        return null;
      }

      const [task] = await tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, dispatch.taskId))
        .limit(1)
        .for('update');
      const isCurrent =
        task &&
        task.workspaceId === (this.workspaceId ?? null) &&
        task.executionGeneration === dispatch.generation &&
        (Boolean(dispatch.automationOccurrence) ||
          (task.requirementRevision === dispatch.requirementRevision &&
            task.policyRevision === dispatch.policyRevision)) &&
        matchesDispatchAssignee(task, dispatch);
      if (!isCurrent) {
        await tx
          .update(taskDispatches)
          .set({
            fence: sql`${taskDispatches.fence} + 1`,
            leaseExpiresAt: null,
            leaseOwner: null,
            phase: 'canceled',
            waitingReason: 'superseded_before_claim',
          })
          .where(eq(taskDispatches.id, dispatch.id));
        return null;
      }

      // A goal stop between request and claim parks the dispatch back to
      // 'waiting' rather than canceling it — the next request resumes the same
      // durable intent once the goal runs again.
      const goalWaitingReason = await this.goalDispatchWaitingReason(
        tx,
        task,
        dispatch.requestedBy.split(':', 1)[0] as TaskRunTrigger,
      );
      if (goalWaitingReason) {
        await tx
          .update(taskDispatches)
          .set({
            leaseExpiresAt: null,
            leaseOwner: null,
            phase: 'waiting',
            waitingReason: goalWaitingReason,
          })
          .where(eq(taskDispatches.id, dispatch.id));
        return null;
      }

      const [claimed] = await tx
        .update(taskDispatches)
        .set({
          fence: sql`${taskDispatches.fence} + 1`,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          leaseOwner: owner,
          phase: 'claimed',
        })
        .where(eq(taskDispatches.id, dispatch.id))
        .returning();
      return claimed ? { dispatch: claimed, fence: claimed.fence } : null;
    });
  }

  /**
   * Reclaim an uncertain dispatch only for reconciliation. The caller must
   * look up the stable dispatch/operation identity and may not launch a second
   * process from this lease.
   */
  async claimForRecovery(
    dispatchId: string,
    owner: string,
    leaseMs: number,
  ): Promise<TaskDispatchRecoveryClaim | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.id, dispatchId), this.scopeCondition()))
        .limit(1)
        .for('update');
      if (
        !dispatch ||
        !['provisioning', 'dispatched', 'running', 'outcome_unknown'].includes(dispatch.phase) ||
        (dispatch.leaseExpiresAt && dispatch.leaseExpiresAt >= now)
      ) {
        return null;
      }

      const [claimed] = await tx
        .update(taskDispatches)
        .set({
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          leaseOwner: owner,
          phase: 'outcome_unknown',
        })
        .where(
          and(
            eq(taskDispatches.id, dispatch.id),
            eq(taskDispatches.fence, dispatch.fence),
            inArray(taskDispatches.phase, [
              'provisioning',
              'dispatched',
              'running',
              'outcome_unknown',
            ]),
            or(isNull(taskDispatches.leaseExpiresAt), lt(taskDispatches.leaseExpiresAt, now)),
          ),
        )
        .returning();
      if (!claimed) return null;

      const [task] = await tx.select().from(tasks).where(eq(tasks.id, claimed.taskId)).limit(1);
      if (!task || task.workspaceId !== (this.workspaceId ?? null)) return null;
      const [topic] = await tx
        .select()
        .from(taskTopics)
        .where(eq(taskTopics.dispatchId, claimed.id))
        .limit(1);
      return { dispatch: claimed, fence: claimed.fence, task, topic };
    });
  }

  /**
   * Mark one sweep-driven resume attempt. This must NOT hold a lease: the
   * re-drive immediately re-enters `claimForProvisioning`, which rejects a
   * live lease owned by someone else — a resume lease would make every
   * re-drive land on `busy` instead of starting. The phase CAS alone is the
   * fence (a row that moved on fails it), and the downstream request path is
   * CAS-serialized end to end. The stale lease is cleared so the next owner
   * cannot be blocked by a dead claimant's window.
   */
  async claimForResume(dispatchId: string): Promise<TaskDispatchLease | null> {
    const now = new Date();
    const [claimed] = await this.db
      .update(taskDispatches)
      .set({
        leaseExpiresAt: null,
        leaseOwner: null,
        recoveryAttempts: sql`${taskDispatches.recoveryAttempts} + 1`,
      })
      .where(
        and(
          eq(taskDispatches.id, dispatchId),
          this.scopeCondition(),
          inArray(taskDispatches.phase, ['requested', 'claimed', 'waiting']),
          or(isNull(taskDispatches.leaseExpiresAt), lt(taskDispatches.leaseExpiresAt, now)),
        ),
      )
      .returning();
    return claimed ? { dispatch: claimed, fence: claimed.fence } : null;
  }

  /** Release a reconciliation lease without changing the execution fence or operation identity. */
  async releaseRecovery(input: {
    dispatchId: string;
    fence: number;
    owner: string;
    phase: Extract<TaskDispatchPhase, 'outcome_unknown' | 'running'>;
    reason: string | null;
    retryAfterMs: number;
  }): Promise<boolean> {
    const [updated] = await this.db
      .update(taskDispatches)
      .set({
        leaseExpiresAt: new Date(Date.now() + Math.max(1, input.retryAfterMs)),
        leaseOwner: null,
        phase: input.phase,
        // A rescheduled `outcome_unknown` counts toward the reconcile bound;
        // a stable live identity resets it — the writer is provably alive.
        recoveryAttempts:
          input.phase === 'outcome_unknown' ? sql`${taskDispatches.recoveryAttempts} + 1` : 0,
        waitingReason: input.reason,
      })
      .where(
        and(
          eq(taskDispatches.id, input.dispatchId),
          this.scopeCondition(),
          eq(taskDispatches.phase, 'outcome_unknown'),
          eq(taskDispatches.fence, input.fence),
          eq(taskDispatches.leaseOwner, input.owner),
        ),
      )
      .returning({ id: taskDispatches.id });
    return Boolean(updated);
  }

  async transition(input: {
    /**
     * Optional admission re-check run inside the claim transaction after
     * the row is locked — the final host-admission gate. Called for
     * transitions into `dispatched` when the persisted (or legacy-derived)
     * origin is `caid`; returning `false` parks the row `waiting` with
     * `caid_dispatch_disabled` instead of starting a new writer (SA05-B).
     */
    admissionRecheck?: (dispatch: TaskDispatchItem) => Promise<boolean>;
    agentId?: string | null;
    dispatchId: string;
    environmentSnapshot?: TaskExecutionEnvironmentSnapshot;
    expected: TaskDispatchPhase[];
    fence: number;
    leaseExpiresAt?: Date | null;
    operationId?: string | null;
    owner: string;
    phase: TaskDispatchPhase;
    waitingReason?: string | null;
  }): Promise<TaskDispatchItem | null> {
    return this.db.transaction(async (tx) => {
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(
          and(
            eq(taskDispatches.id, input.dispatchId),
            this.scopeCondition(),
            eq(taskDispatches.leaseOwner, input.owner),
            eq(taskDispatches.fence, input.fence),
            inArray(taskDispatches.phase, input.expected),
          ),
        )
        .for('update')
        .limit(1);
      if (!dispatch) return null;

      if (['provisioning', 'dispatched', 'running'].includes(input.phase)) {
        const [task] = await tx
          .select()
          .from(tasks)
          .where(eq(tasks.id, dispatch.taskId))
          .for('update')
          .limit(1);
        const currentContract = Boolean(
          task &&
          task.workspaceId === (this.workspaceId ?? null) &&
          task.executionGeneration === dispatch.generation &&
          (Boolean(dispatch.automationOccurrence) ||
            (task.requirementRevision === dispatch.requirementRevision &&
              task.policyRevision === dispatch.policyRevision)) &&
          matchesDispatchAssignee(task, dispatch),
        );
        const requestedTrigger = dispatch.requestedBy.split(':', 1)[0];
        if (requestedTrigger === 'event' && task) {
          const invalid = await this.verifyEventEvidence(
            tx,
            task,
            dispatch.eventEvidence ?? undefined,
            dispatch.id,
          );
          if (invalid) throw invalid;
        }
        const automatedTrigger = ['event', 'heartbeat', 'orchestrator', 'schedule'].includes(
          requestedTrigger,
        )
          ? (requestedTrigger as Extract<
              TaskRunTrigger,
              'event' | 'heartbeat' | 'orchestrator' | 'schedule'
            >)
          : null;
        const automationWaitingReason =
          task &&
          ['event', 'heartbeat', 'schedule'].includes(requestedTrigger) &&
          (executionParkedReason(task) ||
            task.automationMode !== requestedTrigger ||
            task.workflowCategory === 'done' ||
            task.workflowCategory === 'canceled')
            ? 'automation_inactive'
            : null;
        const policyWaitingReason =
          automationWaitingReason ??
          (currentContract && task && automatedTrigger
            ? await this.projectDispatchWaitingReason(tx, task, automatedTrigger, dispatch.id)
            : null);
        const goalWaitingReason =
          currentContract && task && requestedTrigger !== 'manual'
            ? await this.goalDispatchWaitingReason(tx, task, requestedTrigger as TaskRunTrigger)
            : null;
        if (goalWaitingReason) {
          await tx
            .update(taskDispatches)
            .set({
              leaseExpiresAt: null,
              leaseOwner: null,
              phase: 'waiting',
              waitingReason: goalWaitingReason,
            })
            .where(
              and(
                eq(taskDispatches.id, dispatch.id),
                eq(taskDispatches.fence, input.fence),
                eq(taskDispatches.leaseOwner, input.owner),
                inArray(taskDispatches.phase, input.expected),
              ),
            );
          return null;
        }
        if (!currentContract || policyWaitingReason) {
          await tx
            .update(taskDispatches)
            .set({
              fence: sql`${taskDispatches.fence} + 1`,
              leaseExpiresAt: null,
              leaseOwner: null,
              phase: 'canceled',
              waitingReason: policyWaitingReason ?? `superseded_before_${input.phase}`,
            })
            .where(
              and(
                eq(taskDispatches.id, dispatch.id),
                eq(taskDispatches.fence, input.fence),
                eq(taskDispatches.leaseOwner, input.owner),
                inArray(taskDispatches.phase, input.expected),
              ),
            );
          return null;
        }

        // Final CAID admission re-check (SA05-B): the persisted origin is
        // the authority — a rollout flip after prepare must park the claim
        // as `waiting`, not start a new orchestrated writer. Rows written
        // before the `origin` column existed derive the origin from the
        // `trigger:` prefix of `requestedBy`.
        if (input.phase === 'dispatched') {
          const persistedOrigin: TaskDispatchOrigin =
            dispatch.origin ??
            (requestedTrigger === 'goal' || requestedTrigger === 'orchestrator'
              ? 'caid'
              : 'external');
          if (
            persistedOrigin === 'caid' &&
            input.admissionRecheck &&
            !(await input.admissionRecheck(dispatch))
          ) {
            const [waiting] = await tx
              .update(taskDispatches)
              .set({
                leaseExpiresAt: null,
                leaseOwner: null,
                phase: 'waiting',
                waitingReason: 'caid_dispatch_disabled',
              })
              .where(
                and(
                  eq(taskDispatches.id, dispatch.id),
                  eq(taskDispatches.fence, input.fence),
                  eq(taskDispatches.leaseOwner, input.owner),
                  inArray(taskDispatches.phase, input.expected),
                ),
              )
              .returning();
            return waiting ?? null;
          }
          // Final settlement verification (SB09): an `internal` writer only
          // dispatches while its persisted grant is still current and
          // bounded — a stale grant cancels the claim instead of letting a
          // historical association start a new writer.
          if (persistedOrigin === 'internal') {
            const settlementStale = await this.verifySettlementGrant(tx, task, {
              // The claim's own generation bumps executionGeneration at
              // persist time, so the repaired delivery is the previous one.
              expectedSourceGeneration: dispatch.generation - 1,
              grant: dispatch.settlementGrant,
            });
            if (settlementStale) {
              await tx
                .update(taskDispatches)
                .set({
                  fence: sql`${taskDispatches.fence} + 1`,
                  leaseExpiresAt: null,
                  leaseOwner: null,
                  phase: 'canceled',
                  waitingReason: settlementStale,
                })
                .where(
                  and(
                    eq(taskDispatches.id, dispatch.id),
                    eq(taskDispatches.fence, input.fence),
                    eq(taskDispatches.leaseOwner, input.owner),
                    inArray(taskDispatches.phase, input.expected),
                  ),
                );
              return null;
            }
          }
        }
      }

      // Rebinding the agent re-snapshots its roster tier alongside — the
      // durable record of which band this attempt ran at.
      const tierSnapshot =
        input.agentId === undefined
          ? undefined
          : await this.projectAgentTier(tx, dispatch.projectId, input.agentId);
      const [updated] = await tx
        .update(taskDispatches)
        .set({
          agentId: input.agentId,
          environmentSnapshot: input.environmentSnapshot,
          leaseExpiresAt: input.leaseExpiresAt,
          operationId: input.operationId,
          phase: input.phase,
          tier: tierSnapshot,
          waitingReason: input.waitingReason,
        })
        .where(
          and(
            eq(taskDispatches.id, dispatch.id),
            eq(taskDispatches.leaseOwner, input.owner),
            eq(taskDispatches.fence, input.fence),
            inArray(taskDispatches.phase, input.expected),
          ),
        )
        .returning();
      return updated ?? null;
    });
  }

  /**
   * Bounded settlement authority check (SB09): returns a `stale reason` when
   * the minted grant no longer holds against the task's current state, else
   * `null`. Verified at claim time (request) and again at final dispatch
   * (transition into `dispatched`) so a grant can never be exercised outside
   * the window and delivery chain it was minted on.
   *
   * - `reservation_takeover` binds the task's LIVE run reservation token and
   *   its expiry — the handoff the completing run is still holding.
   * - `integration_seed`/`parent_operation` bind the named source dispatch
   *   row: it must exist, belong to this task and workspace, and carry the
   *   generation recorded in the grant.
   * - Grants missing their binding fields (legacy callers) are stale.
   */
  private async verifySettlementGrant(
    tx: Transaction,
    task: TaskItem,
    input: {
      expectedSourceGeneration?: number;
      grant: TaskDispatchSettlementGrant | null | undefined;
    },
  ): Promise<string | null> {
    const grant = input.grant;
    if (!grant) return 'settlement_grant_missing';
    if (grant.workspaceId != null && grant.workspaceId !== task.workspaceId) {
      return 'settlement_grant_workspace_mismatch';
    }
    // A grant without a deadline is unbounded — treat it as expired.
    if (!grant.expiresAt || new Date(grant.expiresAt).getTime() <= Date.now()) {
      return 'settlement_grant_expired';
    }

    if (grant.kind === 'reservation_takeover') {
      if (
        !grant.reservationId ||
        task.runReservationId !== grant.reservationId ||
        !task.runReservationExpiresAt ||
        new Date(task.runReservationExpiresAt).getTime() <= Date.now()
      ) {
        return 'settlement_grant_reservation_stale';
      }
      return null;
    }

    if (!grant.sourceDispatchId || grant.sourceGeneration === undefined) {
      return 'settlement_grant_stale';
    }
    const [source] = await tx
      .select()
      .from(taskDispatches)
      .where(eq(taskDispatches.id, grant.sourceDispatchId))
      .limit(1);
    if (
      !source ||
      source.taskId !== task.id ||
      source.workspaceId !== task.workspaceId ||
      source.generation !== grant.sourceGeneration ||
      (input.expectedSourceGeneration !== undefined &&
        source.generation !== input.expectedSourceGeneration)
    ) {
      return 'settlement_grant_source_stale';
    }
    return null;
  }

  /**
   * Verify the durable event admission evidence an `event` claim cites:
   * the trigger run must still be pending, its trigger still enabled at the
   * cited revision, the subscription binding active and unexpired, the
   * inbox lease live, and the saved tenant/member/connector ownership scope
   * unchanged. Denial codes mirror the canonical DispatchAdmissionErrorCode.
   */
  private async verifyEventEvidence(
    tx: Transaction,
    task: TaskItem,
    evidence: EventDispatchEvidence | undefined,
    existingDispatchId?: string,
  ): Promise<TaskDispatchEventEvidenceError | null> {
    const denied = (code: EventDispatchEvidenceCode, message: string) =>
      new TaskDispatchEventEvidenceError(code, message);
    if (!evidence) return denied('invalid-event', 'Event admission evidence missing');
    if (
      task.automationMode !== 'event' ||
      executionParkedReason(task.context) ||
      ['done', 'canceled'].includes(task.workflowCategory)
    )
      return denied('admission-held', 'Event automation is paused or terminal');
    const now = Date.now();
    const result = await tx.execute<{
      binding_expires: string | null;
      binding_state: string | null;
      connector_agent: string | null;
      connector_enabled: boolean | null;
      connector_status: string | null;
      connector_user: string | null;
      inbox_event: string | null;
      inbox_status: string | null;
      lease_until: string | null;
      member_deleted: Date | null;
      member_role: string | null;
      member_suspended: Date | null;
      run_status: string | null;
      run_dispatch: string | null;
      task_creator: string | null;
      task_deleted: Date | null;
      trigger_enabled: boolean | null;
      trigger_now: number | null;
      trigger_source: string | null;
      trigger_subscription: string | null;
      trigger_task: string | null;
      trigger_user: string | null;
      trigger_workspace: string | null;
    }>(sql`
      SELECT run.status AS run_status, run.dispatch_id AS run_dispatch,
             t.revision AS trigger_now,
             t.enabled AS trigger_enabled,
             t.task_id AS trigger_task,
             t.workspace_id AS trigger_workspace,
             t.user_id AS trigger_user,
             t.subscription_id AS trigger_subscription,
             t.source_id AS trigger_source,
             i.status AS inbox_status,
             i.event_id AS inbox_event,
             i.lease_until AS lease_until,
             b.state AS binding_state,
             b.binding->>'expiresAt' AS binding_expires,
             connector.is_enabled AS connector_enabled,
             connector.status AS connector_status,
             connector.agent_id AS connector_agent,
             connector.user_id AS connector_user,
             member.role AS member_role,
             member.deleted_at AS member_deleted,
             member.suspended_at AS member_suspended,
             task.created_by_user_id AS task_creator,
             task.deleted_at AS task_deleted
      FROM mcp_event_trigger_runs run
      LEFT JOIN mcp_event_triggers t
        ON t.id = run.trigger_id AND t.tenant_id = run.tenant_id
      LEFT JOIN mcp_event_inbox i
        ON i.id = run.inbox_id AND i.tenant_id = run.tenant_id
      LEFT JOIN mcp_event_bindings b
        ON b.id = t.subscription_id AND b.tenant_id = t.tenant_id
      LEFT JOIN user_connectors connector
        ON connector.id::text = t.source_id AND connector.workspace_id = t.workspace_id
      LEFT JOIN workspace_members member
        ON member.workspace_id = t.workspace_id AND member.user_id = t.user_id
      LEFT JOIN tasks task
        ON task.id = t.task_id AND task.workspace_id = t.workspace_id
      WHERE run.id = ${evidence.triggerRunId}
        AND run.tenant_id = ${evidence.tenantId}
        AND run.trigger_id = ${evidence.triggerId}
        AND run.inbox_id = ${evidence.inboxRef}
        AND run.idempotency_key = ${evidence.idempotencyKey}
      LIMIT 1`);
    const row = result.rows[0];
    if (!row) return denied('invalid-event', 'Event admission receipt not found');
    if (
      row.run_status !== 'pending' &&
      !(
        existingDispatchId &&
        row.run_status === 'accepted' &&
        row.run_dispatch === existingDispatchId
      )
    ) {
      return denied('invalid-event', 'Event admission receipt already settled');
    }
    if (
      row.trigger_task !== task.id ||
      row.trigger_workspace !== evidence.workspaceId ||
      row.trigger_user !== evidence.userId ||
      row.trigger_subscription !== evidence.subscriptionId ||
      row.trigger_source !== evidence.sourceId
    ) {
      return denied('tenant-mismatch', 'Event admission scope drifted');
    }
    if (row.trigger_now !== evidence.triggerRevision) {
      return denied('stale-binding', 'Event trigger revision drifted');
    }
    if (row.trigger_enabled !== true) return denied('revoked', 'Event trigger disabled');
    if (
      row.inbox_event !== evidence.eventId ||
      (!existingDispatchId &&
        (row.inbox_status !== 'processing' || !row.lease_until || Number(row.lease_until) <= now))
    ) {
      return denied('invalid-event', 'Event inbox claim no longer held');
    }
    if (
      row.binding_state !== 'active' ||
      (row.binding_expires !== null && Number(row.binding_expires) <= now)
    ) {
      return denied('revoked', 'Event subscription revoked or expired');
    }
    if (
      row.connector_enabled !== true ||
      row.connector_status !== 'connected' ||
      row.connector_agent !== null
    ) {
      return denied('revoked', 'Event source connector unavailable');
    }
    if (
      row.member_deleted !== null ||
      row.member_suspended !== null ||
      !['owner', 'member'].includes(row.member_role ?? '') ||
      row.task_creator === null
    ) {
      return denied('revoked', 'Event scope member no longer active');
    }
    if (
      row.member_role !== 'owner' &&
      !(row.task_creator === row.trigger_user && row.connector_user === row.trigger_user)
    ) {
      return denied('tenant-mismatch', 'Event scope ownership drifted');
    }
    if (row.task_deleted !== null) {
      return denied('revoked', 'Event target task deleted');
    }
    const causation = evidence.causationIds?.filter((id) => id.length > 0) ?? [];
    if (causation.length > 0) {
      const ancestors = await tx
        .select({ taskId: taskDispatches.taskId })
        .from(taskDispatches)
        .where(inArray(taskDispatches.id, causation))
        .limit(10);
      if (ancestors.some((ancestor) => ancestor.taskId === task.id)) {
        return denied('loop', 'Event causation loops into the same task');
      }
    }
    return null;
  }

  async requestStop(input: {
    dispatchId: string;
    fence: number;
    generation: number;
    operationId?: string | null;
    reason: string;
  }): Promise<TaskDispatchItem | null> {
    const [updated] = await this.db
      .update(taskDispatches)
      .set({
        cancelAttempts: 0,
        cancelRequestedAt: new Date(),
        fence: sql`${taskDispatches.fence} + 1`,
        lastCancelError: null,
        leaseExpiresAt: null,
        leaseOwner: null,
        phase: 'cancel_requested',
        waitingReason: input.reason,
      })
      .where(
        and(
          eq(taskDispatches.id, input.dispatchId),
          this.scopeCondition(),
          eq(taskDispatches.fence, input.fence),
          eq(taskDispatches.generation, input.generation),
          input.operationId ? eq(taskDispatches.operationId, input.operationId) : undefined,
          inArray(taskDispatches.phase, [
            'requested',
            'claimed',
            'provisioning',
            'dispatched',
            'running',
            'waiting',
            'outcome_unknown',
          ]),
        ),
      )
      .returning();
    if (updated) return updated;

    // A cancel request can be retried after the remote interrupt succeeded but
    // before the caller finished its local topic/task updates. Reuse only the
    // exact fence successor minted by that request.
    const [existing] = await this.db
      .select()
      .from(taskDispatches)
      .where(
        and(
          eq(taskDispatches.id, input.dispatchId),
          this.scopeCondition(),
          eq(taskDispatches.fence, input.fence + 1),
          eq(taskDispatches.generation, input.generation),
          input.operationId ? eq(taskDispatches.operationId, input.operationId) : undefined,
          eq(taskDispatches.phase, 'cancel_requested'),
        ),
      )
      .limit(1);
    return existing ?? null;
  }

  /**
   * Lease one persisted stop intent. requestStop already advanced the fence,
   * so claiming the worker must not mint another fence: completion callbacks
   * carrying the run's old fence are already stale, while a crashed stop
   * worker can safely retry the same interrupt identity after lease expiry.
   */
  async claimCancellation(
    dispatchId: string,
    owner: string,
    leaseMs: number,
  ): Promise<TaskCancellationClaim | null> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.id, dispatchId), this.scopeCondition()))
        .limit(1)
        .for('update');
      if (
        !dispatch ||
        dispatch.phase !== 'cancel_requested' ||
        (dispatch.leaseExpiresAt && dispatch.leaseExpiresAt >= now)
      ) {
        return null;
      }

      const [claimed] = await tx
        .update(taskDispatches)
        .set({
          cancelAttempts: sql`${taskDispatches.cancelAttempts} + 1`,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          leaseOwner: owner,
        })
        .where(
          and(
            eq(taskDispatches.id, dispatch.id),
            eq(taskDispatches.phase, 'cancel_requested'),
            eq(taskDispatches.fence, dispatch.fence),
            or(isNull(taskDispatches.leaseExpiresAt), lt(taskDispatches.leaseExpiresAt, now)),
          ),
        )
        .returning();
      if (!claimed) return null;

      const [topic] = await tx
        .select()
        .from(taskTopics)
        .where(eq(taskTopics.dispatchId, claimed.id))
        .limit(1);
      return { dispatch: claimed, fence: claimed.fence, topic };
    });
  }

  /** Keep a failed interrupt durable and back it off without releasing its fence. */
  async retryCancellation(input: {
    dispatchId: string;
    fence: number;
    owner: string;
    reason: string;
    retryAfterMs: number;
  }): Promise<boolean> {
    const [updated] = await this.db
      .update(taskDispatches)
      .set({
        lastCancelError: input.reason,
        leaseExpiresAt: new Date(Date.now() + Math.max(1, input.retryAfterMs)),
        leaseOwner: null,
        waitingReason: input.reason,
      })
      .where(
        and(
          eq(taskDispatches.id, input.dispatchId),
          this.scopeCondition(),
          eq(taskDispatches.phase, 'cancel_requested'),
          eq(taskDispatches.fence, input.fence),
          eq(taskDispatches.leaseOwner, input.owner),
        ),
      )
      .returning({ id: taskDispatches.id });
    return Boolean(updated);
  }

  /**
   * Settle the exact leased stop intent and its local run state atomically.
   * The remote interrupt happens before this transaction; if the process dies
   * in between, the same operationId is retried and the terminal write remains
   * idempotent.
   */
  async settleCancellation(input: {
    dispatchId: string;
    fence: number;
    generation: number;
    operationId?: string | null;
    owner: string;
  }): Promise<{
    currentGeneration: boolean;
    dispatch: TaskDispatchItem;
    topicId: string | null;
  } | null> {
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const [dispatch] = await runner
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.id, input.dispatchId), this.scopeCondition()))
        .limit(1)
        .for('update');
      if (
        !dispatch ||
        dispatch.phase !== 'cancel_requested' ||
        dispatch.fence !== input.fence ||
        dispatch.generation !== input.generation ||
        dispatch.leaseOwner !== input.owner ||
        (input.operationId && dispatch.operationId !== input.operationId)
      ) {
        return null;
      }

      const [task] = await runner
        .select()
        .from(tasks)
        .where(eq(tasks.id, dispatch.taskId))
        .limit(1)
        .for('update');
      if (!task || task.workspaceId !== (this.workspaceId ?? null)) return null;

      const currentGeneration = task.executionGeneration === dispatch.generation;
      const [topic] = await runner
        .select()
        .from(taskTopics)
        .where(eq(taskTopics.dispatchId, dispatch.id))
        .limit(1)
        .for('update');
      if (dispatch.operationId && (!topic || topic.operationId !== dispatch.operationId)) {
        return null;
      }

      if (topic) {
        await runner
          .update(taskTopics)
          .set({ runState: 'canceled', status: 'canceled' })
          .where(
            and(
              eq(taskTopics.id, topic.id),
              eq(taskTopics.dispatchId, dispatch.id),
              eq(taskTopics.executionGeneration, dispatch.generation),
            ),
          );
        if (topic.topicId) {
          await runner
            .update(topics)
            .set({ completedAt: new Date() })
            .where(eq(topics.id, topic.topicId));
        }
      }

      if (currentGeneration) {
        const [paused] = await runner
          .update(tasks)
          .set({
            context: parkMarkerSet({ at: new Date().toISOString(), reason: 'canceled' }),
            domainRevision: sql`${tasks.domainRevision} + 1`,
            reviewerUserId: sql<string | null>`coalesce(
              ${tasks.reviewerUserId},
              ${tasks.assigneeUserId},
              ${tasks.createdByUserId}
            )`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, task.id),
              eq(tasks.executionGeneration, dispatch.generation),
              hasActiveExecution,
            ),
          )
          .returning();
        if (!paused) return null;
        if (this.workspaceId) {
          await new LinearSyncModel(runner, this.workspaceId).recordTaskChangeInTransaction(
            runner,
            {
              changedFields: ['status'],
              eventType: 'task.status.changed',
              idempotencyKey: `task:${paused.id}:revision:${paused.domainRevision}:task.status.changed`,
              source: 'system',
              // Runtime cancellation is execution state. Linear workflow state
              // has its own field and must not be echoed back from this write.
              suppressLinearOutbox: true,
              task: paused,
            },
          );
        }
      }

      const [settled] = await runner
        .update(taskDispatches)
        .set({ leaseExpiresAt: null, leaseOwner: null, phase: 'canceled' })
        .where(
          and(
            eq(taskDispatches.id, dispatch.id),
            eq(taskDispatches.phase, 'cancel_requested'),
            eq(taskDispatches.fence, input.fence),
            eq(taskDispatches.generation, input.generation),
            eq(taskDispatches.leaseOwner, input.owner),
          ),
        )
        .returning();
      return settled
        ? { currentGeneration, dispatch: settled, topicId: topic?.topicId ?? null }
        : null;
    });
  }

  /**
   * Give up on a `cancel_requested` dispatch whose interrupt retries hit the
   * bound. Unlike `settleCancellation`, no remote confirmation ever arrived:
   * the dispatch leaves the active-phase set (freeing the task's single
   * execution slot) with the fence already bumped, so a late completion from
   * the abandoned writer is rejected as stale. The task parks at `paused`
   * for human attention rather than pretending the cancel succeeded.
   */
  async abandonCancellation(input: {
    dispatchId: string;
    fence: number;
    generation: number;
    owner: string;
    reason: string;
  }): Promise<{ dispatch: TaskDispatchItem; topicId: string | null } | null> {
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const [dispatch] = await runner
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.id, input.dispatchId), this.scopeCondition()))
        .limit(1)
        .for('update');
      if (
        !dispatch ||
        dispatch.phase !== 'cancel_requested' ||
        dispatch.fence !== input.fence ||
        dispatch.generation !== input.generation ||
        dispatch.leaseOwner !== input.owner
      ) {
        return null;
      }

      const [task] = await runner
        .select()
        .from(tasks)
        .where(eq(tasks.id, dispatch.taskId))
        .limit(1)
        .for('update');
      if (!task || task.workspaceId !== (this.workspaceId ?? null)) return null;

      const [topic] = await runner
        .select()
        .from(taskTopics)
        .where(eq(taskTopics.dispatchId, dispatch.id))
        .limit(1)
        .for('update');
      if (topic) {
        await runner
          .update(taskTopics)
          .set({ runState: 'canceled', status: 'abandoned' })
          .where(
            and(
              eq(taskTopics.id, topic.id),
              eq(taskTopics.dispatchId, dispatch.id),
              eq(taskTopics.executionGeneration, dispatch.generation),
            ),
          );
        if (topic.topicId) {
          await runner
            .update(topics)
            .set({ completedAt: new Date() })
            .where(eq(topics.id, topic.topicId));
        }
      }

      if (task.executionGeneration === dispatch.generation) {
        const [paused] = await runner
          .update(tasks)
          .set({
            context: parkMarkerSet({ at: new Date().toISOString(), reason: input.reason }),
            domainRevision: sql`${tasks.domainRevision} + 1`,
            error: input.reason,
            reviewerUserId: sql<string | null>`coalesce(
              ${tasks.reviewerUserId},
              ${tasks.assigneeUserId},
              ${tasks.createdByUserId}
            )`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, task.id),
              eq(tasks.executionGeneration, dispatch.generation),
              hasActiveExecution,
            ),
          )
          .returning();
        if (!paused) return null;
        if (this.workspaceId) {
          await new LinearSyncModel(runner, this.workspaceId).recordTaskChangeInTransaction(
            runner,
            {
              changedFields: ['status'],
              eventType: 'task.status.changed',
              idempotencyKey: `task:${paused.id}:revision:${paused.domainRevision}:task.status.changed`,
              source: 'system',
              suppressLinearOutbox: true,
              task: paused,
            },
          );
        }
      }

      const [abandoned] = await runner
        .update(taskDispatches)
        .set({
          lastCancelError: input.reason,
          leaseExpiresAt: null,
          leaseOwner: null,
          phase: 'abandoned',
          waitingReason: input.reason,
        })
        .where(
          and(
            eq(taskDispatches.id, dispatch.id),
            eq(taskDispatches.phase, 'cancel_requested'),
            eq(taskDispatches.fence, input.fence),
            eq(taskDispatches.generation, input.generation),
            eq(taskDispatches.leaseOwner, input.owner),
          ),
        )
        .returning();
      return abandoned ? { dispatch: abandoned, topicId: topic?.topicId ?? null } : null;
    });
  }

  /**
   * Give up on an `outcome_unknown` dispatch whose reconcile retries hit the
   * bound — the `abandonCancellation` counterpart for the recovery sweep. No
   * settlement ever arrived: the row leaves the active-phase set (freeing the
   * task's single execution slot) with the fence bumped, so a late write from
   * the unreachable runtime is rejected as stale. The task parks at `paused`
   * for human attention.
   */
  async abandonRecovery(input: {
    dispatchId: string;
    fence: number;
    generation: number;
    owner: string;
    reason: string;
  }): Promise<{ dispatch: TaskDispatchItem; topicId: string | null } | null> {
    return this.db.transaction(async (tx) => {
      const runner = tx as OrviloDatabase;
      const [dispatch] = await runner
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.id, input.dispatchId), this.scopeCondition()))
        .limit(1)
        .for('update');
      if (
        !dispatch ||
        dispatch.phase !== 'outcome_unknown' ||
        dispatch.fence !== input.fence ||
        dispatch.generation !== input.generation ||
        dispatch.leaseOwner !== input.owner
      ) {
        return null;
      }

      const [task] = await runner
        .select()
        .from(tasks)
        .where(eq(tasks.id, dispatch.taskId))
        .limit(1)
        .for('update');
      if (!task || task.workspaceId !== (this.workspaceId ?? null)) return null;

      const [topic] = await runner
        .select()
        .from(taskTopics)
        .where(eq(taskTopics.dispatchId, dispatch.id))
        .limit(1)
        .for('update');
      if (topic) {
        await runner
          .update(taskTopics)
          .set({ runState: 'canceled', status: 'abandoned' })
          .where(
            and(
              eq(taskTopics.id, topic.id),
              eq(taskTopics.dispatchId, dispatch.id),
              eq(taskTopics.executionGeneration, dispatch.generation),
            ),
          );
        if (topic.topicId) {
          await runner
            .update(topics)
            .set({ completedAt: new Date() })
            .where(eq(topics.id, topic.topicId));
        }
      }

      if (task.executionGeneration === dispatch.generation) {
        const [paused] = await runner
          .update(tasks)
          .set({
            context: parkMarkerSet({ at: new Date().toISOString(), reason: input.reason }),
            domainRevision: sql`${tasks.domainRevision} + 1`,
            error: input.reason,
            reviewerUserId: sql<string | null>`coalesce(
              ${tasks.reviewerUserId},
              ${tasks.assigneeUserId},
              ${tasks.createdByUserId}
            )`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, task.id),
              eq(tasks.executionGeneration, dispatch.generation),
              hasActiveExecution,
            ),
          )
          .returning();
        if (!paused) return null;
        if (this.workspaceId) {
          await new LinearSyncModel(runner, this.workspaceId).recordTaskChangeInTransaction(
            runner,
            {
              changedFields: ['status'],
              eventType: 'task.status.changed',
              idempotencyKey: `task:${paused.id}:revision:${paused.domainRevision}:task.status.changed`,
              source: 'system',
              suppressLinearOutbox: true,
              task: paused,
            },
          );
        }
      }

      const [abandoned] = await runner
        .update(taskDispatches)
        .set({
          fence: sql`${taskDispatches.fence} + 1`,
          lastCancelError: input.reason,
          leaseExpiresAt: null,
          leaseOwner: null,
          phase: 'abandoned',
          waitingReason: input.reason,
        })
        .where(
          and(
            eq(taskDispatches.id, dispatch.id),
            eq(taskDispatches.phase, 'outcome_unknown'),
            eq(taskDispatches.fence, input.fence),
            eq(taskDispatches.generation, input.generation),
            eq(taskDispatches.leaseOwner, input.owner),
          ),
        )
        .returning();
      return abandoned ? { dispatch: abandoned, topicId: topic?.topicId ?? null } : null;
    });
  }

  async markWaiting(dispatchId: string, reason: string): Promise<TaskDispatchItem | null> {
    const [updated] = await this.db
      .update(taskDispatches)
      .set({ phase: 'waiting', waitingReason: reason })
      .where(
        and(
          eq(taskDispatches.id, dispatchId),
          this.scopeCondition(),
          inArray(taskDispatches.phase, ['requested', 'claimed']),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async isCurrentClaim(input: {
    dispatchId: string;
    fence: number;
    generation: number;
    operationId?: string;
  }): Promise<boolean> {
    const [claim] = await this.db
      .select({
        currentGeneration: tasks.executionGeneration,
        dispatchGeneration: taskDispatches.generation,
        fence: taskDispatches.fence,
        operationId: taskDispatches.operationId,
        phase: taskDispatches.phase,
      })
      .from(taskDispatches)
      .innerJoin(tasks, eq(tasks.id, taskDispatches.taskId))
      .where(and(eq(taskDispatches.id, input.dispatchId), this.scopeCondition()))
      .limit(1);
    return Boolean(
      claim &&
      claim.currentGeneration === input.generation &&
      claim.dispatchGeneration === input.generation &&
      claim.fence === input.fence &&
      ACTIVE_PHASES.includes(claim.phase) &&
      (!input.operationId || claim.operationId === input.operationId),
    );
  }

  /** Verify a settled run still owns the Task contract its evidence describes. */
  async isCurrentContract(input: {
    dispatchId: string;
    fence: number;
    generation: number;
    operationId: string;
    policyRevision: number;
    requirementRevision: number;
    taskId: string;
  }): Promise<boolean> {
    const [owner] = await this.db
      .select({
        occurrence: taskDispatches.automationOccurrence,
        dispatchAgentId: taskDispatches.agentId,
        dispatchFence: taskDispatches.fence,
        dispatchGeneration: taskDispatches.generation,
        dispatchOperationId: taskDispatches.operationId,
        dispatchPhase: taskDispatches.phase,
        dispatchPolicyRevision: taskDispatches.policyRevision,
        dispatchRequestedBy: taskDispatches.requestedBy,
        dispatchRequirementRevision: taskDispatches.requirementRevision,
        taskAgentId: tasks.assigneeAgentId,
        taskAssigneeUserId: tasks.assigneeUserId,
        taskAssignmentMode: tasks.assignmentMode,
        taskCreatedBySubjectKind: tasks.createdBySubjectKind,
        taskGeneration: tasks.executionGeneration,
        taskId: tasks.id,
        taskOrchestrationOwner: tasks.orchestrationOwner,
        taskPolicyRevision: tasks.policyRevision,
        taskRequirementRevision: tasks.requirementRevision,
      })
      .from(taskDispatches)
      .innerJoin(tasks, eq(tasks.id, taskDispatches.taskId))
      .where(and(eq(taskDispatches.id, input.dispatchId), this.scopeCondition()))
      .limit(1);
    return Boolean(
      owner &&
      owner.dispatchPhase === 'succeeded' &&
      owner.taskId === input.taskId &&
      owner.dispatchFence === input.fence &&
      owner.dispatchGeneration === input.generation &&
      owner.dispatchOperationId === input.operationId &&
      owner.dispatchPolicyRevision === input.policyRevision &&
      owner.dispatchRequirementRevision === input.requirementRevision &&
      owner.taskGeneration === input.generation &&
      (owner.occurrence ||
        (owner.taskPolicyRevision === input.policyRevision &&
          owner.taskRequirementRevision === input.requirementRevision)) &&
      (owner.taskAgentId === owner.dispatchAgentId ||
        (owner.dispatchAgentId !== null &&
          owner.dispatchRequestedBy.startsWith('manual:') &&
          owner.taskAgentId === null &&
          owner.taskAssigneeUserId !== null &&
          owner.taskAssignmentMode === 'manual' &&
          owner.taskOrchestrationOwner === 'manual' &&
          owner.taskCreatedBySubjectKind !== 'integration' &&
          owner.taskCreatedBySubjectKind !== 'system')),
    );
  }

  async settle(input: {
    dispatchId: string;
    expected: TaskDispatchPhase[];
    fence: number;
    generation: number;
    operationId?: string;
    phase: Extract<TaskDispatchPhase, 'canceled' | 'failed' | 'succeeded'>;
  }): Promise<{
    currentContract: boolean;
    currentGeneration: boolean;
    dispatch: TaskDispatchItem;
    state: 'already_settled' | 'settled';
  } | null> {
    return this.db.transaction(async (tx) => {
      const [dispatch] = await tx
        .select()
        .from(taskDispatches)
        .where(and(eq(taskDispatches.id, input.dispatchId), this.scopeCondition()))
        .limit(1)
        .for('update');
      if (!dispatch) return null;
      if (dispatch.fence !== input.fence || dispatch.generation !== input.generation) return null;
      if (input.operationId && dispatch.operationId !== input.operationId) return null;

      const [task] = await tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, dispatch.taskId))
        .limit(1)
        .for('update');
      if (!task) return null;

      const currentGeneration = task.executionGeneration === dispatch.generation;
      const currentContract =
        currentGeneration &&
        (Boolean(dispatch.automationOccurrence) ||
          (task.requirementRevision === dispatch.requirementRevision &&
            task.policyRevision === dispatch.policyRevision)) &&
        matchesDispatchAssignee(task, dispatch);

      if (['canceled', 'failed', 'succeeded'].includes(dispatch.phase)) {
        return {
          currentContract,
          currentGeneration,
          dispatch,
          state: 'already_settled' as const,
        };
      }
      if (!input.expected.includes(dispatch.phase)) return null;

      const [settled] = await tx
        .update(taskDispatches)
        .set({ leaseExpiresAt: null, leaseOwner: null, phase: input.phase })
        .where(
          and(
            eq(taskDispatches.id, dispatch.id),
            eq(taskDispatches.fence, input.fence),
            eq(taskDispatches.generation, input.generation),
            inArray(taskDispatches.phase, input.expected),
          ),
        )
        .returning();
      if (!settled) return null;

      // The execution generation can still be current while its requirement,
      // policy, or assignee snapshot is obsolete. Park that exact run while the
      // Task row is still locked so a successor dispatch cannot start between
      // settlement and the protective status transition.
      if (currentGeneration && !currentContract) {
        const [parked] = await tx
          .update(tasks)
          .set({
            context: parkMarkerSet({
              at: new Date().toISOString(),
              reason: 'stale-contract',
            }),
            domainRevision: sql`${tasks.domainRevision} + 1`,
            error: 'Task changed while this run was active; review before retrying.',
            reviewerUserId: sql<string | null>`coalesce(
              ${tasks.reviewerUserId},
              ${tasks.assigneeUserId},
              ${tasks.createdByUserId}
            )`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, task.id),
              eq(tasks.executionGeneration, dispatch.generation),
              // The dispatch row above already left the active-phase set, so
              // "was live" is asserted by the generation bind; the guard that
              // remains is that nobody parked the task ahead of this settle.
              not(isExecutionParked),
            ),
          )
          .returning();
        if (parked && this.workspaceId) {
          await new LinearSyncModel(
            tx as OrviloDatabase,
            this.workspaceId,
          ).recordTaskChangeInTransaction(tx as OrviloDatabase, {
            changedFields: ['status'],
            eventType: 'task.status.changed',
            idempotencyKey: `task:${task.id}:dispatch:${dispatch.id}:stale-contract`,
            source: 'system',
            suppressLinearOutbox: true,
            task: parked,
          });
        }
      }
      return {
        currentContract,
        currentGeneration,
        dispatch: settled,
        state: 'settled' as const,
      };
    });
  }

  async findById(dispatchId: string): Promise<TaskDispatchItem | undefined> {
    const [dispatch] = await this.db
      .select()
      .from(taskDispatches)
      .where(and(eq(taskDispatches.id, dispatchId), this.scopeCondition()))
      .limit(1);
    if (!dispatch) return undefined;
    return dispatch;
  }

  /** The task's single occupant of the active-phase set, if any. */
  async findActiveByTaskId(taskId: string): Promise<TaskDispatchItem | undefined> {
    const [dispatch] = await this.db
      .select()
      .from(taskDispatches)
      .where(
        and(
          eq(taskDispatches.taskId, taskId),
          this.scopeCondition(),
          inArray(taskDispatches.phase, ACTIVE_PHASES),
        ),
      )
      .limit(1);
    return dispatch;
  }
}
