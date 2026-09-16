import type {
  TaskDispatchPhase,
  TaskExecutionEnvironmentSnapshot,
  TaskRunTrigger,
} from '@orvilo/types';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import type { TaskDispatchItem, TaskItem } from '../schemas/task';
import { taskDispatches, tasks } from '../schemas/task';
import type { LobeChatDatabase } from '../type';
import { idGenerator } from '../utils/idGenerator';

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
        if (existing.phase === 'waiting' && task.assigneeAgentId) {
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

      const generation = task.executionGeneration + 1;
      const [dispatch] = await tx
        .insert(taskDispatches)
        .values({
          agentId: task.assigneeAgentId,
          generation,
          id: input.dispatchId ?? idGenerator('taskDispatches'),
          idempotencyKey: input.idempotencyKey,
          planRevision: input.planRevision,
          policyRevision: task.policyRevision,
          projectId: task.projectId,
          requestedBy: `${input.trigger}:${input.requestedBy}`,
          requirementRevision: task.requirementRevision,
          taskId: task.id,
          taskRevision: task.domainRevision,
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
