import type {
  TaskDispatchPhase,
  TaskExecutionEnvironmentSnapshot,
  TaskRunTrigger,
} from '@orvilo/types';
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';

import { projectAgents, projects } from '../schemas/project';
import type { TaskDispatchItem, TaskItem, TaskTopicItem } from '../schemas/task';
import { taskDispatches, tasks, taskTopics } from '../schemas/task';
import { topics } from '../schemas/topic';
import type { LobeChatDatabase } from '../type';
import { idGenerator } from '../utils/idGenerator';
import { LinearSyncModel } from './linearSync';
import { normalizeProjectOrchestrationPolicy } from './project';

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

export class TaskDispatchNotFoundError extends Error {}
export class TaskDispatchIdempotencyConflictError extends Error {}

export interface RequestTaskDispatchInput {
  dispatchId?: string;
  idempotencyKey: string;
  planRevision?: number | null;
  requestedBy: string;
  taskId: string;
  trigger: TaskRunTrigger | 'orchestrator';
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

/**
 * Durable arbiter for Task execution. Every automated entry point must request
 * a dispatch before provisioning an environment or calling the agent runtime.
 * The Task row lock serializes generation changes; the partial unique index is
 * the database-level backstop against a second active owner.
 */
export class TaskDispatchModel {
  constructor(
    private readonly db: LobeChatDatabase,
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

  private async projectDispatchWaitingReason(
    db: LobeChatDatabase,
    task: TaskItem,
    trigger: TaskRunTrigger | 'orchestrator',
    excludeDispatchId?: string,
  ): Promise<string | null> {
    if (trigger !== 'orchestrator' || !task.projectId || !this.workspaceId) return null;

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
   * Discover durable stop intents whose worker lease is available. The global
   * watchdog uses this read-only scan, then each workspace-scoped model claims
   * one row with compare-and-set before doing any remote interruption.
   */
  static async findCancellationCandidates(
    db: LobeChatDatabase,
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
        let resumedWaitingReason: string | null | undefined;
        if (existing.phase === 'waiting' && input.trigger === 'orchestrator' && task.projectId) {
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
        if (
          existing.phase === 'waiting' &&
          task.assigneeAgentId &&
          (existing.waitingReason === 'no_eligible_agent' || resumedWaitingReason === null)
        ) {
          const [resumed] = await tx
            .update(taskDispatches)
            .set({
              agentId: task.assigneeAgentId,
              phase: 'requested',
              planRevision: input.planRevision,
              policyRevision: task.policyRevision,
              requirementRevision: task.requirementRevision,
              taskRevision: task.domainRevision,
              waitingReason: null,
            })
            .where(and(eq(taskDispatches.id, existing.id), eq(taskDispatches.phase, 'waiting')))
            .returning();
          return { dispatch: resumed ?? existing, state: 'existing' as const, task };
        }
        return { dispatch: existing, state: 'existing' as const, task };
      }

      const [active] = await tx
        .select()
        .from(taskDispatches)
        .where(
          and(eq(taskDispatches.taskId, task.id), inArray(taskDispatches.phase, ACTIVE_PHASES)),
        )
        .limit(1);
      if (active) return { active, state: 'busy' as const, task };

      const waitingReason = await this.projectDispatchWaitingReason(tx, task, input.trigger);
      const generation = task.executionGeneration + 1;
      const [dispatch] = await tx
        .insert(taskDispatches)
        .values({
          agentId: task.assigneeAgentId,
          generation,
          id: input.dispatchId ?? idGenerator('taskDispatches'),
          idempotencyKey: input.idempotencyKey,
          phase: waitingReason ? 'waiting' : 'requested',
          planRevision: input.planRevision,
          policyRevision: task.policyRevision,
          projectId: task.projectId,
          requestedBy: `${input.trigger}:${input.requestedBy}`,
          requirementRevision: task.requirementRevision,
          taskId: task.id,
          taskRevision: task.domainRevision,
          waitingReason,
          workspaceId: task.workspaceId,
        })
        .returning();

      await tx.update(tasks).set({ executionGeneration: generation }).where(eq(tasks.id, task.id));

      return { dispatch, state: 'created' as const, task };
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
        task.domainRevision === dispatch.taskRevision &&
        task.requirementRevision === dispatch.requirementRevision &&
        task.policyRevision === dispatch.policyRevision &&
        task.assigneeAgentId === dispatch.agentId;
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
  ): Promise<TaskDispatchLease | null> {
    const now = new Date();
    const [dispatch] = await this.db
      .update(taskDispatches)
      .set({
        fence: sql`${taskDispatches.fence} + 1`,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        leaseOwner: owner,
        phase: 'outcome_unknown',
      })
      .where(
        and(
          eq(taskDispatches.id, dispatchId),
          this.scopeCondition(),
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
    return dispatch ? { dispatch, fence: dispatch.fence } : null;
  }

  async transition(input: {
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
    const [updated] = await this.db
      .update(taskDispatches)
      .set({
        agentId: input.agentId,
        environmentSnapshot: input.environmentSnapshot,
        leaseExpiresAt: input.leaseExpiresAt,
        operationId: input.operationId,
        phase: input.phase,
        waitingReason: input.waitingReason,
      })
      .where(
        and(
          eq(taskDispatches.id, input.dispatchId),
          this.scopeCondition(),
          eq(taskDispatches.leaseOwner, input.owner),
          eq(taskDispatches.fence, input.fence),
          inArray(taskDispatches.phase, input.expected),
        ),
      )
      .returning();
    return updated ?? null;
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
        fence: sql`${taskDispatches.fence} + 1`,
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
      const runner = tx as LobeChatDatabase;
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

      if (currentGeneration && task.status === 'running') {
        const [paused] = await runner
          .update(tasks)
          .set({
            domainRevision: sql`${tasks.domainRevision} + 1`,
            reviewerUserId: sql<string | null>`coalesce(
              ${tasks.reviewerUserId},
              ${tasks.assigneeUserId},
              ${tasks.createdByUserId}
            )`,
            status: 'paused',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, task.id),
              eq(tasks.executionGeneration, dispatch.generation),
              eq(tasks.status, 'running'),
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

  async settle(input: {
    dispatchId: string;
    expected: TaskDispatchPhase[];
    fence: number;
    generation: number;
    operationId?: string;
    phase: Extract<TaskDispatchPhase, 'canceled' | 'failed' | 'succeeded'>;
  }): Promise<{
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
        .select({ executionGeneration: tasks.executionGeneration })
        .from(tasks)
        .where(eq(tasks.id, dispatch.taskId))
        .limit(1)
        .for('update');
      if (!task) return null;

      if (['canceled', 'failed', 'succeeded'].includes(dispatch.phase)) {
        return {
          currentGeneration: task.executionGeneration === dispatch.generation,
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
      return {
        currentGeneration: task.executionGeneration === dispatch.generation,
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
}
