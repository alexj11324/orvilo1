from pathlib import Path

def edit(path, old, new):
    p = Path(path)
    s = p.read_text()
    if s.count(old) != 1:
        raise RuntimeError(f'{path}: expected one match, got {s.count(old)}: {old[:100]!r}')
    p.write_text(s.replace(old, new, 1))

m = 'packages/database/src/models/task.ts'
edit(m, """  private depsOwnership = () =>
    this.childOwnership({
      userId: taskDependencies.userId,
      visibility: taskDependencies.visibility,
      workspaceId: taskDependencies.workspaceId,
    });""", """  // Authorize through the dependent, not the member who originally added the
  // edge. This also repairs reads of legacy edges after public -> private.
  private depsOwnership = () => sql`exists (
    select 1 from tasks dependency_owner
    where dependency_owner.id = ${taskDependencies.taskId}
      and ${this.ownershipSql('dependency_owner')}
  )`;""")
edit(m, """        type,
        userId: this.userId,
        visibility: task.visibility,""", """        type,
        userId: task.createdByUserId,
        visibility: task.visibility,""")
edit(m, """        set: { type },
        target: [taskDependencies.taskId, taskDependencies.dependsOnId],""", """        set: { type, userId: task.createdByUserId, visibility: task.visibility },
        target: [taskDependencies.taskId, taskDependencies.dependsOnId],""")
edit(m, """    const blockedIds = new Set(await this.findBlockedTaskIds(dependentIds));
    const unlockedIds = dependentIds.filter((id) => !blockedIds.has(id));
    if (unlockedIds.length === 0) return [];

    // Only unlock tasks still waiting in backlog
    return this.db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.id, unlockedIds), eq(tasks.status, 'backlog'), this.ownership()));""", """    // Discovery remains caller-visible. Evaluate each candidate in its owner's
    // scope: the last completing member need not see every private prerequisite.
    const candidates = await this.db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.id, dependentIds), eq(tasks.status, 'backlog'), this.ownership()));
    const byOwner = new Map<string, string[]>();
    for (const task of candidates) {
      const ids = byOwner.get(task.createdByUserId) ?? [];
      ids.push(task.id);
      byOwner.set(task.createdByUserId, ids);
    }
    const blockedIds = new Set((await Promise.all(
      [...byOwner].map(([ownerId, ids]) =>
        new TaskModel(this.db, ownerId, this.workspaceId).findBlockedTaskIds(ids),
      ),
    )).flat());
    return candidates.filter(({ id }) => !blockedIds.has(id));""")
edit(m, """   * by any of `settledTaskIds` with a constant number of queries instead of
   * one dependency walk per settled task.""", """   * by any of `settledTaskIds`, batching readiness checks per dependent owner
   * instead of walking the graph once per settled task.""")
s = Path(m).read_text()
start = s.index('  async delete(id: string): Promise<boolean> {')
end = s.index('\n  /**', start)
edit(m, s[start:end], """  async delete(id: string): Promise<boolean> {
    return (await this.deleteMany([id])).length > 0;
  }

  /** Validate the entire frozen deletion set before any rows disappear. */
  private async assertCanDeleteTasks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const inbound = await this.db
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(and(
        inArray(taskDependencies.dependsOnId, ids),
        notInArray(taskDependencies.taskId, ids),
        eq(taskDependencies.type, 'blocks'),
      ))
      .limit(1);
    if (inbound.length > 0) {
      throw new TaskDependencyError('Remove blocking dependency links before deleting this task.');
    }
  }

  /** Full, unpaginated candidate set; callers can snapshot cleanup before deletion. */
  async getTaskIdsForDeletion(restrictToCreator = false): Promise<string[]> {
    const rows = await this.db.select({ id: tasks.id }).from(tasks).where(and(
      this.ownership(),
      restrictToCreator ? eq(tasks.createdByUserId, this.userId) : undefined,
    ));
    return rows.map(({ id }) => id);
  }

  /** Delete exactly these accessible tasks; return only ids actually deleted. */
  async deleteMany(ids: string[]): Promise<string[]> {
    if (!this.dependencyLockHeld) return this.withDependencyLock((model) => model.deleteMany(ids));
    const accessible = await this.findByIds(ids);
    const liveIds = accessible.map(({ id }) => id);
    if (liveIds.length === 0) return [];
    await this.assertCanDeleteTasks(liveIds);
    const deleted = await this.db.delete(tasks)
      .where(and(inArray(tasks.id, liveIds), this.ownership()))
      .returning({ id: tasks.id });
    return deleted.map(({ id }) => id);
  }
""")
s=Path(m).read_text()
start=s.index('  async deleteAll(options?: { restrictToCreator?: boolean }): Promise<number> {')
end=s.index('\n  /**',start)
edit(m,s[start:end],"""  async deleteAll(options?: { restrictToCreator?: boolean }): Promise<number> {
    if (!this.dependencyLockHeld) return this.withDependencyLock((model) => model.deleteAll(options));
    const ids = await this.getTaskIdsForDeletion(options?.restrictToCreator);
    return (await this.deleteMany(ids)).length;
  }
""")
edit(m,"""  async deleteSubtree(rootTaskId: string): Promise<number> {
    const descendants = await this.findAllDescendants(rootTaskId);
    const taskIds = [rootTaskId, ...descendants.map(({ id }) => id)];

    return this.db.transaction(async (tx) => {""","""  async deleteSubtree(rootTaskId: string): Promise<number> {
    if (!this.dependencyLockHeld) return this.withDependencyLock((model) => model.deleteSubtree(rootTaskId));
    if (!(await this.findById(rootTaskId))) return 0;
    const descendants = await this.findAllDescendants(rootTaskId);
    const taskIds = [rootTaskId, ...descendants.map(({ id }) => id)];
    await this.assertCanDeleteTasks(taskIds);

    return this.db.transaction(async (tx) => {""")
edit(m,'  // ========== Checkpoint ==========\n',"""  /** Commit a deferred heartbeat only if its original tick and schedule still own it. */
  async updateContextIfHeartbeatTick(
    id: string,
    tickToken: string | undefined,
    interval: number,
    scheduler: { scheduledAt: string; tickMessageId: string; tickToken: string },
  ): Promise<boolean> {
    const updated = await this.db.update(tasks).set({
      context: sql`jsonb_set(coalesce(${tasks.context}, '{}'::jsonb), '{scheduler}',
        coalesce(${tasks.context}->'scheduler', '{}'::jsonb) || ${JSON.stringify(scheduler)}::jsonb)`,
      updatedAt: new Date(),
    }).where(and(
      eq(tasks.id, id), this.ownership(), eq(tasks.status, 'scheduled'),
      eq(tasks.automationMode, 'heartbeat'), eq(tasks.heartbeatInterval, interval),
      sql`${tasks.context} #>> '{scheduler,tickToken}' IS NOT DISTINCT FROM ${tickToken ?? null}`,
    )).returning({ id: tasks.id });
    return updated.length > 0;
  }

  // ========== Checkpoint ==========
""")

p='packages/database/src/models/taskDependency.ts'
with Path(p).open('a') as f: f.write("""
/** Preserve the domain distinction through a tRPC Error.cause wrapper. */
export const isTaskDependencyBlocked = (error: unknown): boolean =>
  (error instanceof TaskDependencyError && error.code === 'PRECONDITION_FAILED') ||
  (error instanceof Error && error.cause instanceof TaskDependencyError &&
    error.cause.code === 'PRECONDITION_FAILED');
""")

p='apps/server/src/services/taskIntegration/index.ts'
edit(p,"""  async cleanupTaskWorktrees(taskId: string): Promise<void> {
    try {
      const rows = await this.taskTopicModel.findByTaskId(taskId);""","""  async snapshotTaskWorktrees(taskId: string) {
    return this.taskTopicModel.findByTaskId(taskId);
  }

  async cleanupTaskWorktrees(
    taskId: string,
    snapshot?: Awaited<ReturnType<TaskTopicModel['findByTaskId']>>,
  ): Promise<void> {
    try {
      // Delete callers capture records first, commit the guarded deletion, and
      // only then perform irreversible device cleanup from that snapshot.
      const rows = snapshot ?? await this.taskTopicModel.findByTaskId(taskId);""")
edit(p,"""      for (const { paths, topicId } of candidates) {
        await this.taskTopicModel""","""      if (snapshot) return; // The task_topics rows were already deleted.
      for (const { paths, topicId } of candidates) {
        await this.taskTopicModel""")

p='apps/server/src/routers/lambda/task.ts'
edit(p,"""      // Worktree teardown must precede the delete: task_topics rows (and
      // their integration records) cascade away with the task rows.
      const { tasks: doomed } = await model.list({
        createdByUserId: restrictToCreator ? ctx.userId : undefined,
        limit: 10_000,
      });
      await Promise.allSettled(
        doomed.map((task) => ctx.taskIntegration.cleanupTaskWorktrees(task.id)),
      );
      const count = await model.deleteAll({ restrictToCreator });""","""      // Snapshot without side effects, then delete a frozen set under the graph
      // lock. A rejected deletion must never remove a surviving task's worktree.
      const ids = await model.getTaskIdsForDeletion(restrictToCreator);
      const snapshots = new Map(await Promise.all(ids.map(async (id) =>
        [id, await ctx.taskIntegration.snapshotTaskWorktrees(id)] as const,
      )));
      const deletedIds = await model.deleteMany(ids);
      await Promise.allSettled(deletedIds.map((id) =>
        ctx.taskIntegration.cleanupTaskWorktrees(id, snapshots.get(id)!),
      ));
      const count = deletedIds.length;""")
edit(p,"""    } catch (error) {
      console.error('[task:clearAll]', error);""","""    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof TaskDependencyError) {
        throw new TRPCError({ cause: error, code: error.code, message: error.message });
      }
      console.error('[task:clearAll]', error);""")
edit(p,"""      // Tear down provisioned run worktrees before the task_topics rows
      // cascade away with the task. Best-effort — never blocks the delete.
      await ctx.taskIntegration.cleanupTaskWorktrees(task.id);
      await model.delete(task.id);""","""      const snapshot = await ctx.taskIntegration.snapshotTaskWorktrees(task.id);
      const deleted = await model.delete(task.id);
      if (deleted) await ctx.taskIntegration.cleanupTaskWorktrees(task.id, snapshot);""")
edit(p,"""      if (error instanceof TRPCError) throw error;
      console.error('[task:delete]', error);""","""      if (error instanceof TRPCError) throw error;
      if (error instanceof TaskDependencyError) {
        throw new TRPCError({ cause: error, code: error.code, message: error.message });
      }
      console.error('[task:delete]', error);""")

p='apps/server/src/services/taskRunner/index.ts'
edit(p,"import { TaskModel } from '@/database/models/task';","import { TaskModel } from '@/database/models/task';\nimport { isTaskDependencyBlocked, TaskDependencyError } from '@/database/models/taskDependency';")
edit(p,"""      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Complete all prerequisite tasks before starting this task.',
      });""","""      throw new TaskDependencyError(
        'Complete all prerequisite tasks before starting this task.', 'PRECONDITION_FAILED',
      );""")
edit(p,"""    for (const task of unlocked) {
      if (await this.shouldHoldForCheckpoint(task)) {
        await this.taskModel.updateStatus(task.id, 'paused');""","""    for (const task of unlocked) {
      const runner = task.createdByUserId && task.createdByUserId !== this.userId
        ? new TaskRunnerService(this.db, task.createdByUserId, this.workspaceId)
        : this;
      if (await runner.shouldHoldForCheckpoint(task)) {
        await runner.taskModel.updateStatusIfCurrent(task.id, 'backlog', 'paused');""")
edit(p,"""        await this.runTask({ taskId: task.id });
        result.started.push(task.identifier);
      } catch (error) {
        if (error instanceof TRPCError && error.code === 'CONFLICT') {""","""        await runner.runTask({ taskId: task.id });
        result.started.push(task.identifier);
      } catch (error) {
        // Readiness can change after discovery. No execution happened: leave
        // backlog intact so the next upstream completion can discover it again.
        if (isTaskDependencyBlocked(error)) continue;
        if (error instanceof TRPCError && error.code === 'CONFLICT') {""")
edit(p,"          await this.taskModel.updateStatus(task.id, 'paused', { error: message });","          await runner.taskModel.updateStatusIfCurrent(task.id, 'backlog', 'paused', { error: message });")

p='apps/server/src/services/taskLifecycle/index.ts'
edit(p,"import { TaskModel } from '@/database/models/task';","import { TaskModel } from '@/database/models/task';\nimport { isTaskDependencyBlocked } from '@/database/models/taskDependency';")
edit(p,"""      lifecycleFailed = true;
      throw error;
    } finally {""","""      if (isTaskDependencyBlocked(error)) {
        // The topic is settled, but its delivery cannot complete after an
        // upstream reopen. Park this generation for recovery, not as a ghost run.
        try {
          await this.taskModel.updateStatusIfReservation(
            taskId, claimed, claimedTaskStatus, 'paused',
            { error: 'A prerequisite changed during this run. Complete the prerequisites before resuming.' },
          );
          verifyBound = false;
          return;
        } catch (recoveryError) {
          lifecycleFailed = true;
          throw recoveryError;
        }
      }
      lifecycleFailed = true;
      throw error;
    } finally {""")

p='apps/server/src/services/taskRunner/heartbeatTick.ts'
edit(p,"import { TRPCError } from '@trpc/server';","import { randomUUID } from 'node:crypto';\n\nimport { TRPCError } from '@trpc/server';")
edit(p,"import { BriefModel } from '@/database/models/brief';","import { BriefModel } from '@/database/models/brief';\nimport { TaskModel } from '@/database/models/task';\nimport { isTaskDependencyBlocked } from '@/database/models/taskDependency';")
edit(p,"import { setTaskSchedulerExecutionCallback } from '@/server/services/taskScheduler';","import { createTaskSchedulerModule, setTaskSchedulerExecutionCallback } from '@/server/services/taskScheduler';")
edit(p,"export type HeartbeatTickSkipReason =\n","export type HeartbeatTickSkipReason =\n  | 'dependencies-blocked'\n  | 'paused'\n")
edit(p,"""  const wsId = task.workspaceId ?? undefined;
  const briefModel""","""  if (task.status === 'paused') return { ran: false, reason: 'paused' };

  const wsId = task.workspaceId ?? undefined;
  const briefModel""")
edit(p,"""  } catch (e) {
    // Concurrent tick / manual run already running this task""","""  } catch (e) {
    if (isTaskDependencyBlocked(e)) {
      if (task.status === 'scheduled') {
        const scheduler = createTaskSchedulerModule();
        const nextToken = randomUUID();
        const tickMessageId = await scheduler.scheduleNextTopic({
          delay: task.heartbeatInterval, taskId, tickToken: nextToken, userId,
        });
        let retained = false;
        try {
          retained = await new TaskModel(db, userId, wsId).updateContextIfHeartbeatTick(
            taskId, activeTickToken, task.heartbeatInterval,
            { scheduledAt: new Date().toISOString(), tickMessageId, tickToken: nextToken },
          );
        } finally {
          // Another tick, pause, cancel or configuration edit won. Never keep
          // a delayed message that no longer owns this scheduled generation.
          if (!retained) await scheduler.cancelScheduled(tickMessageId);
        }
      }
      return { ran: false, reason: 'dependencies-blocked' };
    }
    // Concurrent tick / manual run already running this task""")

p='apps/server/src/services/taskRunner/scheduleTick.ts'
edit(p,"import { TaskModel } from '@/database/models/task';","import { TaskModel } from '@/database/models/task';\nimport { isTaskDependencyBlocked } from '@/database/models/taskDependency';")
edit(p,"export type ScheduleTickSkipReason =\n","export type ScheduleTickSkipReason =\n  | 'dependencies-blocked'\n")
edit(p,"""  } catch (e) {
    // Concurrent tick / manual run already running this task""","""  } catch (e) {
    if (isTaskDependencyBlocked(e)) return { ran: false, reason: 'dependencies-blocked' };
    // Concurrent tick / manual run already running this task""")
edit(p,"        await taskModel.updateStatus(taskId, 'completed', { completedAt: new Date() });","""        try {
          await taskModel.updateStatus(taskId, 'completed', { completedAt: new Date() });
        } catch (error) {
          if (isTaskDependencyBlocked(error)) return { ran: false, reason: 'dependencies-blocked' };
          throw error;
        }""")

p='src/store/task/slices/detail/action.ts'
edit(p,"{ refreshInterval: shouldPoll ? TASK_DETAIL_POLL_INTERVAL : 0 },","{ refreshInterval: shouldPoll ? TASK_DETAIL_POLL_INTERVAL : taskId ? 15_000 : 0 },")
edit(p,"      // Even an idle dependent must refresh when an upstream completes or reopens.","      // Busy/linked tasks refresh faster. Idle mounted details still refresh at\n      // 15s below, including a teammate adding the very first prerequisite.")
