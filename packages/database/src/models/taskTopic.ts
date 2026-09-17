import { randomUUID } from 'node:crypto';

import type {
  BriefDecision,
  TaskExecutionEnvironmentSnapshot,
  TaskTopicHandoff,
  TaskTopicIntegration,
} from '@orvilo/types';
import { and, count, desc, eq, exists, gte, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';

import type { TaskTopicItem } from '../schemas/task';
import { tasks, taskTopics } from '../schemas/task';
import { topics } from '../schemas/topic';
import type { LobeChatDatabase } from '../type';
import { buildWorkspaceWhere } from '../utils/workspace';

const TERMINAL_TOPIC_STATUSES = new Set(['canceled', 'completed', 'failed', 'timeout']);

const runStateForStatus = (status: string) => {
  if (status === 'completed') return 'succeeded' as const;
  if (status === 'canceled') return 'canceled' as const;
  if (status === 'failed' || status === 'timeout') return 'failed' as const;
  return 'running' as const;
};

export class TaskTopicModel {
  private readonly userId: string;
  private readonly db: LobeChatDatabase;
  private readonly workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.db = db;
    this.userId = userId;
    this.workspaceId = workspaceId;
  }

  private ownership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      {
        userId: taskTopics.userId,
        visibility: taskTopics.visibility,
        workspaceId: taskTopics.workspaceId,
      },
    );

  private taskOwnership = () =>
    buildWorkspaceWhere(
      { userId: this.userId, workspaceId: this.workspaceId },
      {
        userId: tasks.createdByUserId,
        visibility: tasks.visibility,
        workspaceId: tasks.workspaceId,
      },
    );

  /** Look up the parent task's visibility so newly added topics mirror it. */
  private async getTaskVisibility(taskId: string): Promise<'private' | 'public'> {
    const row = await this.db
      .select({ visibility: tasks.visibility })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    return row[0]?.visibility ?? 'public';
  }

  /**
   * Mirror a terminal taskTopic transition onto the underlying topic record:
   * stamp `topics.completedAt` so duration can be computed at read time, and
   * promote `topics.status` to 'completed' on a clean finish.
   */
  private async markTopicEnded(topicId: string, status: string): Promise<void> {
    const setClause: { completedAt: Date; status?: 'completed' } = { completedAt: new Date() };
    if (status === 'completed') setClause.status = 'completed';

    await this.db
      .update(topics)
      .set(setClause)
      .where(
        and(
          eq(topics.id, topicId),
          buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, topics),
        ),
      );
  }

  async add(
    taskId: string,
    topicId: string,
    params: {
      dispatch?: {
        fence: number;
        generation: number;
        id: string;
        planRevision: number | null;
        policyRevision: number;
        requirementRevision: number;
        taskRevision: number;
      };
      environmentSnapshot?: TaskExecutionEnvironmentSnapshot;
      integration?: TaskTopicIntegration;
      operationId?: string;
      seq: number;
      trigger?: 'manual' | 'schedule' | 'heartbeat' | 'goal' | 'orchestrator';
    },
  ): Promise<void> {
    const visibility = await this.getTaskVisibility(taskId);
    await this.db
      .insert(taskTopics)
      .values({
        dispatchFence: params.dispatch?.fence,
        dispatchId: params.dispatch?.id,
        environmentSnapshot: params.environmentSnapshot,
        executionGeneration: params.dispatch?.generation,
        integration: params.integration,
        operationId: params.operationId,
        planRevision: params.dispatch?.planRevision,
        policyRevision: params.dispatch?.policyRevision,
        requirementRevision: params.dispatch?.requirementRevision,
        seq: params.seq,
        taskId,
        taskRevision: params.dispatch?.taskRevision,
        topicId,
        trigger: params.trigger,
        userId: this.userId,
        visibility,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoNothing();
  }

  /** Persist the exact dispatch owner before the runtime is allowed to start. */
  async startRun(
    taskId: string,
    topicId: string,
    params: {
      dispatch: {
        fence: number;
        generation: number;
        id: string;
        planRevision: number | null;
        policyRevision: number;
        requirementRevision: number;
        taskRevision: number;
      };
      environmentSnapshot?: TaskExecutionEnvironmentSnapshot;
      integration?: TaskTopicIntegration;
      operationId: string;
      seq: number;
      trigger?: 'manual' | 'schedule' | 'heartbeat' | 'goal' | 'orchestrator';
    },
  ): Promise<void> {
    const visibility = await this.getTaskVisibility(taskId);
    const run = {
      dispatchFence: params.dispatch.fence,
      dispatchId: params.dispatch.id,
      environmentSnapshot: params.environmentSnapshot,
      executionGeneration: params.dispatch.generation,
      operationId: params.operationId,
      planRevision: params.dispatch.planRevision,
      policyRevision: params.dispatch.policyRevision,
      requirementRevision: params.dispatch.requirementRevision,
      runState: 'running' as const,
      status: 'running',
      taskRevision: params.dispatch.taskRevision,
      trigger: params.trigger,
    };
    await this.db
      .insert(taskTopics)
      .values({
        ...run,
        integration: params.integration,
        seq: params.seq,
        taskId,
        topicId,
        userId: this.userId,
        visibility,
        workspaceId: this.workspaceId ?? null,
      })
      .onConflictDoUpdate({
        set: {
          ...run,
          ...(params.integration === undefined ? {} : { integration: params.integration }),
        },
        target: [taskTopics.taskId, taskTopics.topicId],
      });
  }

  /** Settle history only while the topic row still belongs to that dispatch. */
  async settleHistoricalRun(
    taskId: string,
    topicId: string,
    claim: { dispatchId: string; fence: number; generation: number },
    status: 'canceled' | 'completed' | 'failed',
    lastAssistantContent?: string,
  ): Promise<boolean> {
    const [updated] = await this.db
      .update(taskTopics)
      .set({
        ...(lastAssistantContent
          ? {
              handoff: sql`jsonb_set(COALESCE(${taskTopics.handoff}, '{}'::jsonb), '{content}', ${JSON.stringify(lastAssistantContent)}::jsonb)`,
            }
          : {}),
        runState: runStateForStatus(status),
        status,
      })
      .where(
        and(
          eq(taskTopics.taskId, taskId),
          eq(taskTopics.topicId, topicId),
          eq(taskTopics.dispatchId, claim.dispatchId),
          eq(taskTopics.dispatchFence, claim.fence),
          eq(taskTopics.executionGeneration, claim.generation),
          this.ownership(),
        ),
      )
      .returning({ topicId: taskTopics.topicId });
    if (!updated) return false;
    await this.markTopicEnded(topicId, status);
    return true;
  }

  /**
   * Patch the run's workspace-integration record in place. Used by
   * TaskIntegrationService as the merge state machine advances (pending →
   * conflict → integrated/…).
   */
  async updateIntegration(
    taskId: string,
    topicId: string,
    patch: { [K in keyof TaskTopicIntegration]?: TaskTopicIntegration[K] | null },
  ): Promise<boolean> {
    const updated = await this.db
      .update(taskTopics)
      .set({
        integration: sql`jsonb_strip_nulls(${taskTopics.integration} || ${JSON.stringify(patch)}::jsonb)`,
      })
      .where(
        and(
          eq(taskTopics.taskId, taskId),
          eq(taskTopics.topicId, topicId),
          isNotNull(taskTopics.integration),
          this.ownership(),
        ),
      )
      .returning({ id: taskTopics.id });

    return updated.length > 0;
  }

  /** Atomically lease one integration-state transition across duplicate callbacks/retries. */
  async claimIntegration(
    taskId: string,
    topicId: string,
    expectedState: TaskTopicIntegration['state'],
    token: string,
    staleBefore: Date,
    leaseTopicId = topicId,
  ): Promise<boolean> {
    const claimed = await this.db
      .update(taskTopics)
      .set({
        integration: sql`coalesce(${taskTopics.integration}, '{}'::jsonb) || jsonb_build_object('integrationOwnerTopicId', ${leaseTopicId}::text, 'processingToken', ${token}::text, 'processingStartedAt', ${new Date().toISOString()}::text)`,
      })
      .where(
        and(
          eq(taskTopics.taskId, taskId),
          eq(taskTopics.topicId, leaseTopicId),
          this.ownership(),
          ...(leaseTopicId === topicId
            ? [sql`${taskTopics.integration}->>'state' = ${expectedState}`]
            : []),
          or(
            sql`not coalesce((${taskTopics.integration}->>'worktreeCleaned')::boolean, false)`,
            and(
              sql`not coalesce((${taskTopics.integration}->>'integrationWorktreeCleaned')::boolean, false)`,
              sql`coalesce(${taskTopics.integration}->>'integrationWorktreePath', '') <> ''`,
            ),
          ),
          or(
            sql`not coalesce(jsonb_exists(${taskTopics.integration}, 'processingToken'), false)`,
            sql`coalesce((${taskTopics.integration}->>'processingStartedAt')::timestamptz, '-infinity'::timestamptz) < ${staleBefore}`,
          ),
        ),
      )
      .returning({ id: taskTopics.id });
    if (claimed.length === 0) return false;

    // A corrective chain leases its original task-run row. Backfill the
    // callback's owner with an atomic JSONB patch and require its state to
    // remain processable after acquiring that shared lease.
    if (leaseTopicId !== topicId) {
      const current = await this.db
        .update(taskTopics)
        .set({
          integration: sql`coalesce(${taskTopics.integration}, '{}'::jsonb) || jsonb_build_object('integrationOwnerTopicId', ${leaseTopicId}::text)`,
        })
        .where(
          and(
            eq(taskTopics.taskId, taskId),
            eq(taskTopics.topicId, topicId),
            this.ownership(),
            sql`${taskTopics.integration}->>'state' = ${expectedState}`,
            or(
              sql`not coalesce((${taskTopics.integration}->>'worktreeCleaned')::boolean, false)`,
              and(
                sql`not coalesce((${taskTopics.integration}->>'integrationWorktreeCleaned')::boolean, false)`,
                sql`coalesce(${taskTopics.integration}->>'integrationWorktreePath', '') <> ''`,
              ),
            ),
          ),
        )
        .returning({ id: taskTopics.id });
      if (current.length === 0) {
        await this.releaseIntegration(taskId, leaseTopicId, token);
        return false;
      }
    }

    return true;
  }

  /** Release only the integration lease owned by this invocation. */
  async releaseIntegration(taskId: string, topicId: string, token: string): Promise<void> {
    await this.db
      .update(taskTopics)
      .set({
        integration: sql`coalesce(${taskTopics.integration}, '{}'::jsonb) - 'processingToken' - 'processingStartedAt'`,
      })
      .where(
        and(
          eq(taskTopics.taskId, taskId),
          eq(taskTopics.topicId, topicId),
          this.ownership(),
          sql`${taskTopics.integration}->>'processingToken' = ${token}`,
        ),
      );
  }

  async updateStatus(taskId: string, topicId: string, status: string): Promise<void> {
    await this.db
      .update(taskTopics)
      .set({ runState: runStateForStatus(status), status })
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId), this.ownership()));

    if (TERMINAL_TOPIC_STATUSES.has(status)) {
      await this.markTopicEnded(topicId, status);
    }
  }

  /**
   * Atomically cancel a topic only if it is still in `running` status.
   * Returns true if a row was actually updated.
   */
  async cancelIfRunning(taskId: string, topicId: string): Promise<boolean> {
    const result = await this.db
      .update(taskTopics)
      .set({ runState: 'canceled', status: 'canceled' })
      .where(
        and(
          eq(taskTopics.taskId, taskId),
          eq(taskTopics.topicId, topicId),
          eq(taskTopics.status, 'running'),
          this.ownership(),
        ),
      )
      .returning();

    const updated = result.length > 0;
    if (updated) await this.markTopicEnded(topicId, 'canceled');
    return updated;
  }

  /**
   * Cancel every still-running topic under the given tasks in one statement,
   * returning the rows that were actually flipped. Used by the family status
   * cascade so a topic that started after the caller's snapshot is still
   * marked canceled inside the same transaction as the status update.
   */
  async cancelRunningByTaskIds(taskIds: string[]): Promise<TaskTopicItem[]> {
    if (taskIds.length === 0) return [];

    const canceled = await this.db
      .update(taskTopics)
      .set({ runState: 'canceled', status: 'canceled' })
      .where(
        and(
          inArray(taskTopics.taskId, taskIds),
          eq(taskTopics.status, 'running'),
          this.ownership(),
        ),
      )
      .returning();

    for (const topic of canceled) {
      if (topic.topicId) await this.markTopicEnded(topic.topicId, 'canceled');
    }

    return canceled;
  }

  async updateOperationId(taskId: string, topicId: string, operationId?: string): Promise<void> {
    await this.db
      .update(taskTopics)
      .set({ operationId })
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId), this.ownership()));
  }

  async updateHandoff(taskId: string, topicId: string, handoff: TaskTopicHandoff): Promise<void> {
    await this.db
      .update(taskTopics)
      .set({ handoff })
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId), this.ownership()));
  }

  /**
   * Patch the `briefDecision` field inside the handoff JSONB without
   * disturbing other handoff keys (`title` / `summary` / `keyFindings` /
   * `nextAction`). Uses `jsonb_set` so the operation is order-independent
   * with respect to `updateHandoff` — either can run first.
   */
  async updateBriefDecision(
    taskId: string,
    topicId: string,
    decision: BriefDecision,
  ): Promise<void> {
    await this.db
      .update(taskTopics)
      .set({
        handoff: sql`jsonb_set(COALESCE(${taskTopics.handoff}, '{}'::jsonb), '{briefDecision}', ${JSON.stringify(decision)}::jsonb)`,
      })
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId), this.ownership()));
  }

  /**
   * Patch the raw run output into `handoff.content` without
   * disturbing other handoff keys. Uses `jsonb_set` so it is order-independent
   * with respect to `updateHandoff` — critically, this lets the caller persist
   * the last message even when the (separate) handoff-summary LLM call fails, so
   * the run card always has a result to show.
   */
  async updateHandoffContent(taskId: string, topicId: string, content: string): Promise<void> {
    await this.db
      .update(taskTopics)
      .set({
        handoff: sql`jsonb_set(COALESCE(${taskTopics.handoff}, '{}'::jsonb), '{content}', ${JSON.stringify(content)}::jsonb)`,
      })
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId), this.ownership()));
  }

  async updateReview(
    taskId: string,
    topicId: string,
    review: {
      iteration: number;
      passed: boolean;
      score: number;
      scores: any[];
    },
  ): Promise<void> {
    await this.db
      .update(taskTopics)
      .set({
        reviewIteration: review.iteration,
        reviewPassed: review.passed ? 1 : 0,
        reviewScore: review.score,
        reviewScores: review.scores,
        reviewedAt: new Date(),
      })
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId), this.ownership()));
  }

  async timeoutRunning(taskId: string): Promise<number> {
    const result = await this.db
      .update(taskTopics)
      .set({ runState: 'failed', status: 'timeout' })
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.status, 'running'), this.ownership()))
      .returning({ topicId: taskTopics.topicId });

    await Promise.all(
      result
        .map((r) => r.topicId)
        .filter((id): id is string => !!id)
        .map((id) => this.markTopicEnded(id, 'timeout')),
    );

    return result.length;
  }

  async findByTopicId(topicId: string): Promise<TaskTopicItem | null> {
    const result = await this.db
      .select()
      .from(taskTopics)
      .where(and(eq(taskTopics.topicId, topicId), this.ownership()))
      .limit(1);
    return result[0] || null;
  }

  async findByOperationId(operationId: string): Promise<TaskTopicItem | null> {
    const result = await this.db
      .select()
      .from(taskTopics)
      .where(and(eq(taskTopics.operationId, operationId), this.ownership()))
      .limit(1);
    return result[0] ?? null;
  }

  /**
   * Atomically accept a terminal callback exactly once.
   *
   * Queue delivery is at-least-once. A plain read followed by `updateStatus`
   * lets two copies both run the lifecycle side effects. Restricting the
   * transition to the still-running row makes the status write the claim.
   */
  async settleIfRunning(
    taskId: string,
    topicId: string,
    operationId: string,
    status: 'completed' | 'failed',
  ): Promise<string | null> {
    const now = new Date();
    const reservationPrefix = `completion:${operationId}:`;
    const completionReservationId = `${reservationPrefix}${randomUUID()}`;
    const leaseExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const claimed = await this.db.transaction(async (tx) => {
      const settled = await tx
        .update(taskTopics)
        .set({ runState: runStateForStatus(status), status })
        .where(
          and(
            eq(taskTopics.taskId, taskId),
            eq(taskTopics.topicId, topicId),
            eq(taskTopics.operationId, operationId),
            eq(taskTopics.status, 'running'),
            exists(
              tx
                .select({ id: tasks.id })
                .from(tasks)
                .where(
                  and(
                    eq(tasks.id, taskId),
                    eq(tasks.currentTopicId, topicId),
                    eq(tasks.status, 'running'),
                  ),
                ),
            ),
            this.ownership(),
          ),
        )
        .returning({ id: taskTopics.id });

      if (settled.length > 0) {
        const taskClaim = await tx
          .update(tasks)
          .set({
            lastHeartbeatAt: now,
            runReservationExpiresAt: leaseExpiresAt,
            runReservationId: completionReservationId,
            updatedAt: now,
          })
          .where(
            and(
              eq(tasks.id, taskId),
              eq(tasks.currentTopicId, topicId),
              eq(tasks.status, 'running'),
              this.taskOwnership(),
            ),
          )
          .returning({ id: tasks.id });
        if (taskClaim.length === 0) {
          throw new Error('Task generation changed while claiming its completion callback');
        }
        return completionReservationId;
      }

      // The callback may have claimed task_topics and then crashed before its
      // side effects finished. Reclaim only its expired completion lease; an
      // active owner makes this delivery retryable instead of being mistaken
      // for an already-settled duplicate.
      const reclaimed = await tx
        .update(tasks)
        .set({
          lastHeartbeatAt: now,
          runReservationExpiresAt: leaseExpiresAt,
          runReservationId: completionReservationId,
          updatedAt: now,
        })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.currentTopicId, topicId),
            inArray(tasks.status, ['running', 'scheduled']),
            sql`${tasks.runReservationId} like ${`${reservationPrefix}%`}`,
            sql`${tasks.runReservationExpiresAt} <= ${now}`,
            this.taskOwnership(),
            exists(
              tx
                .select({ id: taskTopics.id })
                .from(taskTopics)
                .where(
                  and(
                    eq(taskTopics.taskId, taskId),
                    eq(taskTopics.topicId, topicId),
                    eq(taskTopics.operationId, operationId),
                    eq(taskTopics.status, status),
                    this.ownership(),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: tasks.id });
      return reclaimed.length > 0 ? completionReservationId : null;
    });

    if (claimed) {
      await this.markTopicEnded(topicId, status);
      return claimed;
    }

    const [active] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.currentTopicId, topicId),
          sql`${tasks.runReservationId} like ${`${reservationPrefix}%`}`,
          sql`${tasks.runReservationExpiresAt} > ${now}`,
          this.taskOwnership(),
        ),
      )
      .limit(1);
    if (active) throw new Error('Task completion callback is already being processed');
    return null;
  }

  /**
   * Count a task's runs, optionally scoped by creation time and/or trigger
   * source.
   *
   * `triggers` filters on the `trigger` column so the maxExecutions quota can
   * count only automation ticks and ignore ad-hoc manual runs.
   * Legacy rows have a NULL trigger; they are excluded whenever `triggers` is
   * passed (they predate the column and can't be attributed to a schedule).
   */
  async countByTask(
    taskId: string,
    options?: {
      since?: Date;
      triggers?: Array<'manual' | 'schedule' | 'heartbeat' | 'goal' | 'orchestrator'>;
    },
  ): Promise<number> {
    const conditions = [eq(taskTopics.taskId, taskId), this.ownership()];
    if (options?.since) conditions.push(gte(taskTopics.createdAt, options.since));
    if (options?.triggers?.length) conditions.push(inArray(taskTopics.trigger, options.triggers));

    const rows = await this.db
      .select({ value: count() })
      .from(taskTopics)
      .where(and(...conditions));
    return rows[0]?.value ?? 0;
  }

  async findByTaskId(taskId: string): Promise<TaskTopicItem[]> {
    return this.db
      .select()
      .from(taskTopics)
      .where(and(eq(taskTopics.taskId, taskId), this.ownership()))
      .orderBy(desc(taskTopics.seq));
  }

  async findRunningByTaskIds(taskIds: string[]): Promise<TaskTopicItem[]> {
    if (taskIds.length === 0) return [];

    return this.db
      .select()
      .from(taskTopics)
      .where(
        and(
          inArray(taskTopics.taskId, taskIds),
          eq(taskTopics.status, 'running'),
          this.ownership(),
        ),
      )
      .orderBy(desc(taskTopics.seq));
  }

  async findWithDetails(taskId: string) {
    return this.db
      .select({
        createdAt: topics.createdAt,
        handoff: taskTopics.handoff,
        id: topics.id,
        metadata: topics.metadata,
        operationId: taskTopics.operationId,
        reviewIteration: taskTopics.reviewIteration,
        reviewPassed: taskTopics.reviewPassed,
        reviewScore: taskTopics.reviewScore,
        reviewScores: taskTopics.reviewScores,
        reviewedAt: taskTopics.reviewedAt,
        seq: taskTopics.seq,
        status: taskTopics.status,
        title: topics.title,
        updatedAt: topics.updatedAt,
      })
      .from(taskTopics)
      .innerJoin(topics, eq(taskTopics.topicId, topics.id))
      .where(and(eq(taskTopics.taskId, taskId), this.ownership()))
      .orderBy(desc(taskTopics.seq));
  }

  async findWithHandoff(taskId: string, limit: number) {
    return this.db
      .select({
        // The agent that actually ran this topic — used so each activity row
        // keeps its own avatar instead of inheriting the task's *current*
        // assignee (which changes when the task is reassigned).
        agentId: topics.agentId,
        completedAt: topics.completedAt,
        totalCost: topics.totalCost,
        createdAt: taskTopics.createdAt,
        handoff: taskTopics.handoff,
        integration: taskTopics.integration,
        metadata: topics.metadata,
        operationId: taskTopics.operationId,
        seq: taskTopics.seq,
        status: taskTopics.status,
        title: topics.title,
        topicId: taskTopics.topicId,
        trigger: taskTopics.trigger,
      })
      .from(taskTopics)
      .leftJoin(topics, eq(taskTopics.topicId, topics.id))
      .where(and(eq(taskTopics.taskId, taskId), this.ownership()))
      .orderBy(desc(taskTopics.seq))
      .limit(limit);
  }

  /**
   * A goal's spend and round count in one aggregate: how many runs those tasks
   * produced and what they cost.
   *
   * The Goal page renders these numbers and the coordinator enforces the budget
   * against them, so both read them from here — a second definition of "what
   * this goal has spent" would let the header disagree with the move that
   * parks the goal on `budget_exhausted`.
   *
   * `topics.totalCost` is NULL for a run that has not settled yet; those count
   * as a round but contribute nothing to the sum.
   */
  async sumRunCostByTaskIds(taskIds: string[]): Promise<{
    byTask: { runs: number; taskId: string; totalCost: number; totalTokens: number }[];
    runs: number;
    totalCost: number;
    totalTokens: number;
  }> {
    if (taskIds.length === 0) return { byTask: [], runs: 0, totalCost: 0, totalTokens: 0 };

    // Grouped once, then folded — one round trip serves both the enforced
    // total and the per-Task breakdown the cost panel lists.
    const rows = await this.db
      .select({
        runs: count(),
        taskId: taskTopics.taskId,
        totalCost: sql<string>`coalesce(sum(${topics.totalCost}), 0)`,
        totalTokens: sql<string>`coalesce(sum(${topics.totalTokens}), 0)`,
      })
      .from(taskTopics)
      .leftJoin(topics, eq(taskTopics.topicId, topics.id))
      .where(and(inArray(taskTopics.taskId, taskIds), this.ownership()))
      .groupBy(taskTopics.taskId);

    const byTask = rows.map((row) => ({
      runs: row.runs,
      taskId: row.taskId,
      totalCost: Number(row.totalCost ?? 0),
      totalTokens: Number(row.totalTokens ?? 0),
    }));

    return {
      byTask,
      runs: byTask.reduce((sum, row) => sum + row.runs, 0),
      totalCost: byTask.reduce((sum, row) => sum + row.totalCost, 0),
      totalTokens: byTask.reduce((sum, row) => sum + row.totalTokens, 0),
    };
  }

  async findWithHandoffByTaskIds(taskIds: string[], limit: number) {
    if (taskIds.length === 0) return [];

    return this.db
      .select({
        // The agent that actually ran this topic — used so each activity row
        // keeps its own avatar instead of inheriting the task's *current*
        // assignee (which changes when the task is reassigned).
        agentId: topics.agentId,
        completedAt: topics.completedAt,
        totalCost: topics.totalCost,
        createdAt: taskTopics.createdAt,
        handoff: taskTopics.handoff,
        integration: taskTopics.integration,
        metadata: topics.metadata,
        operationId: taskTopics.operationId,
        seq: taskTopics.seq,
        sourceTaskAssigneeAgentId: tasks.assigneeAgentId,
        sourceTaskId: tasks.id,
        sourceTaskIdentifier: tasks.identifier,
        sourceTaskName: tasks.name,
        status: taskTopics.status,
        title: topics.title,
        topicId: taskTopics.topicId,
        trigger: taskTopics.trigger,
      })
      .from(taskTopics)
      .innerJoin(tasks, eq(taskTopics.taskId, tasks.id))
      .leftJoin(topics, eq(taskTopics.topicId, topics.id))
      .where(and(inArray(taskTopics.taskId, taskIds), this.ownership()))
      .orderBy(desc(taskTopics.createdAt), desc(taskTopics.seq))
      .limit(limit);
  }

  /**
   * Workspace-wide roll-up of every run belonging to a task that still has an
   * automation mode configured — the rows behind the Automations "All runs"
   * surface. Runs of tasks whose automation was later removed drop out with
   * the task itself; a paused automation still counts as configured.
   *
   * `createdByUserId` narrows the roll-up to automations one member created
   * (the list page's "mine" tab); `search` matches the automation name or the
   * run title; `statuses` is an include-list on the run's own status.
   */
  async findAutomationRuns(options: {
    createdByUserId?: string;
    limit: number;
    offset: number;
    search?: string;
    statuses?: string[];
  }) {
    const conditions = [isNotNull(tasks.automationMode), this.ownership()];
    if (options.createdByUserId) {
      conditions.push(eq(tasks.createdByUserId, options.createdByUserId));
    }
    if (options.statuses?.length) {
      conditions.push(inArray(taskTopics.status, options.statuses));
    }
    if (options.search) {
      const pattern = `%${options.search}%`;
      conditions.push(or(ilike(tasks.name, pattern), ilike(topics.title, pattern))!);
    }
    const where = and(...conditions);

    const [rows, totals] = await Promise.all([
      this.db
        .select({
          // The agent that actually ran this topic — used so each activity row
          // keeps its own avatar instead of inheriting the task's *current*
          // assignee (which changes when the task is reassigned).
          agentId: topics.agentId,
          completedAt: topics.completedAt,
          totalCost: topics.totalCost,
          createdAt: taskTopics.createdAt,
          handoff: taskTopics.handoff,
          operationId: taskTopics.operationId,
          seq: taskTopics.seq,
          sourceTaskAssigneeAgentId: tasks.assigneeAgentId,
          sourceTaskId: tasks.id,
          sourceTaskIdentifier: tasks.identifier,
          sourceTaskName: tasks.name,
          status: taskTopics.status,
          title: topics.title,
          topicId: taskTopics.topicId,
          trigger: taskTopics.trigger,
        })
        .from(taskTopics)
        .innerJoin(tasks, eq(taskTopics.taskId, tasks.id))
        .leftJoin(topics, eq(taskTopics.topicId, topics.id))
        .where(where)
        .orderBy(desc(taskTopics.createdAt), desc(taskTopics.seq))
        .limit(options.limit)
        .offset(options.offset),
      this.db
        .select({ value: count() })
        .from(taskTopics)
        .innerJoin(tasks, eq(taskTopics.taskId, tasks.id))
        .leftJoin(topics, eq(taskTopics.topicId, topics.id))
        .where(where),
    ]);

    return { rows, total: totals[0]?.value ?? 0 };
  }

  /**
   * Success/failure counts for the "All runs" summary cards: completed vs
   * failed/timeout runs in the trailing 24h and 7d windows, scoped the same
   * way as `findAutomationRuns` (a timeout reads as a failure on the UI).
   */
  async automationRunStats(options?: { createdByUserId?: string }): Promise<{
    completed24h: number;
    completed7d: number;
    failed24h: number;
    failed7d: number;
  }> {
    const conditions = [
      isNotNull(tasks.automationMode),
      this.ownership(),
      gte(taskTopics.createdAt, sql`now() - interval '7 days'`),
    ];
    if (options?.createdByUserId) {
      conditions.push(eq(tasks.createdByUserId, options.createdByUserId));
    }

    const rows = await this.db
      .select({
        completed24h: sql<number>`count(*) filter (where ${taskTopics.status} = 'completed' and ${taskTopics.createdAt} >= now() - interval '24 hours')::int`,
        completed7d: sql<number>`count(*) filter (where ${taskTopics.status} = 'completed')::int`,
        failed24h: sql<number>`count(*) filter (where ${taskTopics.status} in ('failed', 'timeout') and ${taskTopics.createdAt} >= now() - interval '24 hours')::int`,
        failed7d: sql<number>`count(*) filter (where ${taskTopics.status} in ('failed', 'timeout'))::int`,
      })
      .from(taskTopics)
      .innerJoin(tasks, eq(taskTopics.taskId, tasks.id))
      .where(and(...conditions));

    return (
      rows[0] ?? {
        completed24h: 0,
        completed7d: 0,
        failed24h: 0,
        failed7d: 0,
      }
    );
  }

  async remove(taskId: string, topicId: string): Promise<boolean> {
    const result = await this.db
      .delete(taskTopics)
      .where(and(eq(taskTopics.taskId, taskId), eq(taskTopics.topicId, topicId), this.ownership()))
      .returning();

    if (result.length > 0) {
      await this.db
        .update(tasks)
        .set({
          totalTopics: sql`GREATEST(${tasks.totalTopics} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));
    }

    return result.length > 0;
  }
}
