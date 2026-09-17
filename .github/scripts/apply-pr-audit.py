from pathlib import Path
import json

root = Path.cwd()

def replace(path, old, new):
    p = root / path
    s = p.read_text()
    assert s.count(old) == 1, (path, s.count(old), old[:80])
    p.write_text(s.replace(old, new))

p = 'packages/database/src/models/task.ts'
replace(p, "import { TaskDependencyError } from './taskDependency';", "import { TaskDependencyError } from './taskDependency';\nimport { TaskTopicModel } from './taskTopic';")
replace(p, '''    // All tasks that depend on any of the completed tasks
    const dependents = await this.db''', '''    // Only a visible, completed source may trigger internal dispatch. Targets
    // are discovered across this workspace, then evaluated as their creators.
    // This method is internal to the runner; never return its rows from an API.
    const sources = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(inArray(tasks.id, settledTaskIds), eq(tasks.status, 'completed'), this.ownership()));
    if (sources.length === 0) return [];
    const dependents = await this.db''')
replace(p, '''          inArray(taskDependencies.dependsOnId, settledTaskIds),
          eq(taskDependencies.type, 'blocks'),
          this.depsOwnership(),''', '''          inArray(taskDependencies.dependsOnId, sources.map(({ id }) => id)),
          eq(taskDependencies.type, 'blocks'),
          this.workspaceId
            ? eq(taskDependencies.workspaceId, this.workspaceId)
            : and(isNull(taskDependencies.workspaceId), eq(taskDependencies.userId, this.userId)),''')
replace(p, '''    // Discovery remains caller-visible. Evaluate each candidate in its owner's
    // scope: the last completing member need not see every private prerequisite.
    const candidates = await this.db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.id, dependentIds), eq(tasks.status, 'backlog'), this.ownership()));''', '''    const candidates = await this.db
      .select()
      .from(tasks)
      .where(and(
        inArray(tasks.id, dependentIds),
        eq(tasks.status, 'backlog'),
        isNull(tasks.deletedAt),
        sql`${tasks.isDeleted} IS NOT TRUE`,
        this.seqOwnership(),
      ));''')
replace(p, '  // ========== Dependencies ==========', '''  /** Persist a confirmed interruption after its requested state change failed.
   * The operation, topic and reservation fences leave a successor untouched.
   * No remote I/O runs while the dependency graph transaction is held.
   */
  async recoverInterruptedRun(input: {
    currentTopicId: string | null;
    id: string;
    operationId: string | null;
    reservationId: string | null;
    topicId: string;
  }): Promise<boolean> {
    if (!this.dependencyLockHeld) {
      return this.withDependencyLock((model) => model.recoverInterruptedRun(input));
    }
    const [interrupted] = await this.db
      .select({ id: taskTopics.id })
      .from(taskTopics)
      .where(and(
        eq(taskTopics.taskId, input.id),
        eq(taskTopics.topicId, input.topicId),
        input.operationId === null
          ? isNull(taskTopics.operationId)
          : eq(taskTopics.operationId, input.operationId),
        inArray(taskTopics.status, ['running', 'canceled']),
        this.topicsOwnership(),
      ))
      .for('update');
    if (!interrupted) return false;
    await new TaskTopicModel(this.db, this.userId, this.workspaceId)
      .cancelIfRunning(input.id, input.topicId);
    if (input.currentTopicId !== null && input.currentTopicId !== input.topicId) return false;
    const recovered = await this.db
      .update(tasks)
      .set({
        runReservationExpiresAt: null,
        runReservationId: null,
        status: 'paused',
        updatedAt: new Date(),
      })
      .where(and(
        eq(tasks.id, input.id),
        eq(tasks.status, 'running'),
        input.currentTopicId === null
          ? isNull(tasks.currentTopicId)
          : eq(tasks.currentTopicId, input.currentTopicId),
        input.reservationId === null
          ? isNull(tasks.runReservationId)
          : eq(tasks.runReservationId, input.reservationId),
        this.ownership(),
      ))
      .returning({ id: tasks.id });
    return recovered.length > 0;
  }

  // ========== Dependencies ==========''')

p = 'apps/server/src/services/taskRunner/index.ts'
replace(p, '''    for (const task of unlocked) {
      const runner =''', '''    for (const task of unlocked) {
      // Internal owner-scoped dispatch may see private dependents. The caller's
      // response must not reveal their identifiers or execution errors.
      const canReport = task.visibility === 'public' || task.createdByUserId === this.userId;
      const runner =''')
for field, value in [('paused', 'task.identifier'), ('started', 'task.identifier'), ('failed', '{ error: message, identifier: task.identifier }')]:
    replace(p, f'        result.{field}.push({value});', f'        if (canReport) result.{field}.push({value});')

p = 'apps/server/src/services/task/index.ts'
replace(p, '''  /**
   * Transition a task to a new status, cascading the side effects:''', '''  private async recoverInterruptedRuns(
    targetTasks: TaskItem[],
    interruptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>>,
    cause: unknown,
  ): Promise<void> {
    const failures = [];
    for (const topic of interruptedTopics) {
      if (!topic.topicId) continue;
      const snapshot = targetTasks.find(({ id }) => id === topic.taskId);
      if (!snapshot) continue;
      try {
        await this.taskModel.recoverInterruptedRun({
          currentTopicId: snapshot.currentTopicId ?? null,
          id: snapshot.id,
          operationId: topic.operationId ?? null,
          reservationId: snapshot.runReservationId ?? null,
          topicId: topic.topicId,
        });
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError([cause, ...failures], 'Failed to persist interrupted task recovery');
    }
  }

  /**
   * Transition a task to a new status, cascading the side effects:''')
pth = root / p
s = pth.read_text()
start = s.index("    if (resolved.status === 'running' && status !== 'running') {")
end = s.index('    if (!task) {', start)
chunk = s[start:end].replace('''        await this.taskTopicModel.cancelIfRunning(resolved.id, t.topicId);''', '''        interruptedTopics.push(t);
        await this.taskTopicModel.cancelIfRunning(resolved.id, t.topicId);''').replace('    const task = actor', '    task = actor')
s = s[:start] + '''    const interruptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>> = [];
    let task: TaskItem | null | undefined;
    try {
''' + ''.join('  ' + line if line.strip() else line for line in chunk.splitlines(keepends=True)) + '''    } catch (error) {
      await this.recoverInterruptedRuns([resolved], interruptedTopics, error);
      throw error;
    }
''' + s[end:]
pth.write_text(s)
replace(p, '''    const runningTopics = await this.taskTopicModel.findRunningByTaskIds(targetIds);
    if (runningTopics.length > 0) {''', '''    const runningTopics = await this.taskTopicModel.findRunningByTaskIds(targetIds);
    let interruptedTopics: typeof runningTopics = [];
    if (runningTopics.length > 0) {''')
replace(p, '''      const failure = settled.find((result) => result.status === 'rejected');
      if (failure) {
        // Persist the interrupts that did succeed before surfacing the error,
        // so an actually-stopped operation is not left recorded as running.
        for (const [index, topic] of runningTopics.entries()) {
          if (settled[index].status !== 'fulfilled' || !topic.topicId) continue;
          await this.taskTopicModel
            .cancelIfRunning(topic.taskId, topic.topicId)
            .catch(() => undefined);
        }
        throw failure.reason;
      }''', '''      interruptedTopics = runningTopics.filter((_, index) => settled[index].status === 'fulfilled');
      const failure = settled.find((result) => result.status === 'rejected');
      if (failure) {
        await this.recoverInterruptedRuns(targetTasks, interruptedTopics, failure.reason);
        throw failure.reason;
      }''')
s = pth.read_text()
start = s.index('    await this.db.transaction(async (tx) => {', s.index('  async updateStatusCascade('))
end = s.index('    // Best-effort: stop any operation', start)
chunk = s[start:end].rstrip() + '\n'
s = s[:start] + '    try {\n' + ''.join('  ' + line if line.strip() else line for line in chunk.splitlines(keepends=True)) + '''    } catch (error) {
      await this.recoverInterruptedRuns(targetTasks, interruptedTopics, error);
      throw error;
    }

''' + s[end:]
pth.write_text(s)

p = 'src/store/task/slices/detail/action.ts'
replace(p, "import { mutate, useClientDataSWR } from '@/libs/swr';", "import { mutate, useClientPollingSWR } from '@/libs/swr';")
replace(p, '    return useClientDataSWR(', '    return useClientPollingSWR(')
replace(p, '{ refreshInterval: shouldPoll ? TASK_DETAIL_POLL_INTERVAL : taskId ? 15_000 : 0 },', '{ dedupingInterval: 1_000, refreshInterval: shouldPoll ? TASK_DETAIL_POLL_INTERVAL : taskId ? 15_000 : 0 },')
(root / 'packages/database/migrations/0169_task_dependency_ownership.sql').write_text('''-- Legacy edges recorded the member who added them rather than the dependent's
-- creator. Re-home them before ON DELETE CASCADE can erase another owner's
-- prerequisite when that member deletes their account. Safe to replay.
UPDATE "task_dependencies" AS dependency
SET "user_id" = task.created_by_user_id
FROM "tasks" AS task
WHERE dependency.task_id = task.id
  AND dependency.user_id IS DISTINCT FROM task.created_by_user_id;
''')
pth = root / 'packages/database/migrations/meta/_journal.json'
j = json.loads(pth.read_text())
assert j['entries'][-1]['idx'] == 168
j['entries'].append({'idx': 169, 'version': '7', 'when': 1789614900000, 'tag': '0169_task_dependency_ownership', 'breakpoints': True})
pth.write_text(json.dumps(j, indent=2) + '\n')
