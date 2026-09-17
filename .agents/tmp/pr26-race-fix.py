from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, got {count}')
    p.write_text(text.replace(old, new, 1))


task_model = 'packages/database/src/models/task.ts'
replace_once(
    task_model,
    """  private async withDependencyLock<T>(work: (model: TaskModel) => Promise<T>): Promise<T> {
    if (this.dependencyLockHeld) return work(this);
    return this.db.transaction(async (tx) => {
      const model = new TaskModel(tx as LobeChatDatabase, this.userId, this.workspaceId);
      await model.lockDependencyGraph();
      model.dependencyLockHeld = true;
      return work(model);
    });
  }
""",
    """  private async withDependencyLock<T>(work: (model: TaskModel) => Promise<T>): Promise<T> {
    if (this.dependencyLockHeld) return work(this);
    return this.db.transaction(async (tx) => {
      const model = new TaskModel(tx as LobeChatDatabase, this.userId, this.workspaceId);
      await model.acquireDependencyLockForTransaction();
      return work(model);
    });
  }

  /**
   * Acquire the prerequisite graph lock inside an already-open transaction.
   * Callers that also mutate task/topic rows must take this lock first so
   * recovery and status cascades share one global lock order.
   */
  async acquireDependencyLockForTransaction(): Promise<void> {
    if (this.dependencyLockHeld) return;
    await this.lockDependencyGraph();
    this.dependencyLockHeld = true;
  }
""",
)
replace_once(
    task_model,
    """  async recoverInterruptedRun(input: {
    currentTopicId: string | null;
    id: string;
    operationId: string | null;
    reservationId: string | null;
    topicId: string;
  }): Promise<boolean> {
""",
    """  async recoverInterruptedRun(input: {
    currentTopicId: string | null;
    id: string;
    operationId: string | null;
    parkTask?: boolean;
    reservationId: string | null;
    topicId: string;
  }): Promise<boolean> {
""",
)
replace_once(
    task_model,
    """    const [interrupted] = await this.db
      .select({ id: taskTopics.id })
      .from(taskTopics)
      .where(
        and(
          eq(taskTopics.taskId, input.id),
          eq(taskTopics.topicId, input.topicId),
          input.operationId === null
            ? isNull(taskTopics.operationId)
            : eq(taskTopics.operationId, input.operationId),
          inArray(taskTopics.status, ['running', 'canceled']),
          this.topicsOwnership(),
        ),
      )
      .for('update');
    if (!interrupted) return false;
    await new TaskTopicModel(this.db, this.userId, this.workspaceId).cancelIfRunning(
      input.id,
      input.topicId,
    );
    // A stopped historical/non-current topic must never inherit the task's
    // current reservation. Only the exact current topic generation may park
    // task-level state; otherwise recovery is topic-local.
    const [taskState] = await this.db
      .select({
        currentTopicId: tasks.currentTopicId,
        runReservationId: tasks.runReservationId,
        status: tasks.status,
      })
      .from(tasks)
      .where(and(eq(tasks.id, input.id), this.ownership()))
      .for('update');
    if (!taskState || !shouldParkInterruptedTask(taskState, input)) return false;
""",
    """    // Lock and validate the task generation before touching its topic. A
    // continuation can reuse a topic before it swaps operationId; canceling the
    // topic first would otherwise kill that successor generation.
    const [taskState] = await this.db
      .select({
        currentTopicId: tasks.currentTopicId,
        runReservationId: tasks.runReservationId,
        status: tasks.status,
      })
      .from(tasks)
      .where(and(eq(tasks.id, input.id), this.ownership()))
      .for('update');
    if (!taskState) return false;
    const ownsTaskGeneration = shouldParkInterruptedTask(taskState, input);
    if (taskState.currentTopicId === input.topicId && !ownsTaskGeneration) return false;

    const [interrupted] = await this.db
      .select({ id: taskTopics.id })
      .from(taskTopics)
      .where(
        and(
          eq(taskTopics.taskId, input.id),
          eq(taskTopics.topicId, input.topicId),
          input.operationId === null
            ? isNull(taskTopics.operationId)
            : eq(taskTopics.operationId, input.operationId),
          inArray(taskTopics.status, ['running', 'canceled']),
          this.topicsOwnership(),
        ),
      )
      .for('update');
    if (!interrupted) return false;
    await new TaskTopicModel(this.db, this.userId, this.workspaceId).cancelIfRunning(
      input.id,
      input.topicId,
    );
    if (!ownsTaskGeneration || input.parkTask === false) return false;
""",
)

service = 'apps/server/src/services/task/index.ts'
replace_once(
    service,
    """  private async recoverInterruptedRuns(
    targetTasks: TaskItem[],
    interruptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>>,
    cause: unknown,
  ): Promise<void> {
    const failures = [];
    for (const topic of interruptedTopics) {
""",
    """  private async recoverInterruptedRuns(
    targetTasks: TaskItem[],
    interruptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>>,
    cause: unknown,
    attemptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>> = interruptedTopics,
  ): Promise<void> {
    const failures = [];
    const attemptedByTask = new Map<string, number>();
    const interruptedByTask = new Map<string, number>();
    for (const topic of attemptedTopics) {
      attemptedByTask.set(topic.taskId, (attemptedByTask.get(topic.taskId) ?? 0) + 1);
    }
    for (const topic of interruptedTopics) {
      interruptedByTask.set(topic.taskId, (interruptedByTask.get(topic.taskId) ?? 0) + 1);
    }
    for (const topic of interruptedTopics) {
""",
)
replace_once(
    service,
    """      const generation = buildInterruptedTaskGeneration(snapshot, topic);
      if (!generation) continue;
      try {
        await this.taskModel.recoverInterruptedRun(generation);
""",
    """      const generation = buildInterruptedTaskGeneration(snapshot, topic);
      if (!generation) continue;
      const allTaskRunsInterrupted =
        (interruptedByTask.get(topic.taskId) ?? 0) === (attemptedByTask.get(topic.taskId) ?? 0);
      try {
        await this.taskModel.recoverInterruptedRun(
          allTaskRunsInterrupted ? generation : { ...generation, parkTask: false },
        );
""",
)
replace_once(
    service,
    """    const interruptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>> = [];
    let task: TaskItem | null | undefined;
""",
    """    const interruptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>> = [];
    let attemptedTopics: Awaited<ReturnType<TaskTopicModel['findRunningByTaskIds']>> = [];
    let task: TaskItem | null | undefined;
""",
)
replace_once(
    service,
    """        const topics = await this.taskTopicModel.findByTaskId(resolved.id);
        const aiAgentService = new AiAgentService(this.db, this.userId, {
""",
    """        const topics = await this.taskTopicModel.findByTaskId(resolved.id);
        attemptedTopics = topics.filter((topic) => topic.status === 'running' && Boolean(topic.topicId));
        const aiAgentService = new AiAgentService(this.db, this.userId, {
""",
)
replace_once(
    service,
    """    } catch (error) {
      await this.recoverInterruptedRuns([resolved], interruptedTopics, error);
      throw error;
    }
""",
    """    } catch (error) {
      await this.recoverInterruptedRuns([resolved], interruptedTopics, error, attemptedTopics);
      throw error;
    }
""",
)
replace_once(
    service,
    """      if (failure) {
        await this.recoverInterruptedRuns(targetTasks, interruptedTopics, failure.reason);
        throw failure.reason;
      }
""",
    """      if (failure) {
        await this.recoverInterruptedRuns(targetTasks, interruptedTopics, failure.reason, runningTopics);
        throw failure.reason;
      }
""",
)
replace_once(
    service,
    """        const taskModel = new TaskModel(tx, this.userId, this.workspaceId);
        const taskTopicModel = new TaskTopicModel(tx, this.userId, this.workspaceId);

        // Cancel by the frozen id set rather than the pre-read topic list, so a
""",
    """        const taskModel = new TaskModel(tx, this.userId, this.workspaceId);
        const taskTopicModel = new TaskTopicModel(tx, this.userId, this.workspaceId);

        // Recovery acquires this advisory lock before task/topic rows. Take
        // the same lock first here to prevent the inverse lock order deadlock.
        await taskModel.acquireDependencyLockForTransaction();

        // Cancel by the frozen id set rather than the pre-read topic list, so a
""",
)

service_test = 'apps/server/src/services/task/index.test.ts'
replace_once(
    service_test,
    """  const mockTaskModel = {
    areAllDependenciesCompleted: vi.fn().mockResolvedValue(true),
    recoverInterruptedRun: vi.fn().mockResolvedValue(true),
""",
    """  const mockTaskModel = {
    acquireDependencyLockForTransaction: vi.fn().mockResolvedValue(undefined),
    areAllDependenciesCompleted: vi.fn().mockResolvedValue(true),
    recoverInterruptedRun: vi.fn().mockResolvedValue(true),
""",
)
replace_once(
    service_test,
    """        expect(mockTaskModel.recoverInterruptedRun).toHaveBeenCalledExactlyOnceWith(
          expectedRecovery,
        );
        expect(taskWorktreeCleanupMock).not.toHaveBeenCalled();
""",
    """        expect(mockTaskModel.recoverInterruptedRun).toHaveBeenCalledExactlyOnceWith(
          expectedRecovery,
        );
        if (path === 'cascade') {
          expect(mockTaskModel.acquireDependencyLockForTransaction).toHaveBeenCalledTimes(1);
          expect(
            mockTaskModel.acquireDependencyLockForTransaction.mock.invocationCallOrder[0],
          ).toBeLessThan(mockTaskTopicModel.cancelRunningByTaskIds.mock.invocationCallOrder[0]);
        }
        expect(taskWorktreeCleanupMock).not.toHaveBeenCalled();
""",
)
marker = """    it('surfaces a failed recovery rather than silently leaving a stopped run live', async () => {
"""
addition = """    it('does not park a task when only one of its own running operations was interrupted', async () => {
      mockTaskModel.resolve.mockResolvedValue(snapshot);
      mockTaskModel.findAllDescendants.mockResolvedValue([]);
      mockTaskTopicModel.findRunningByTaskIds.mockResolvedValue([
        running,
        { ...running, topicId: 'topic-2', operationId: 'op-2' },
      ]);
      interruptTaskMock
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false });
      await expect(
        new TaskService(db, userId).updateStatusCascade({ id: 'T-1', status: 'completed' }),
      ).rejects.toThrow('Task interruption was not confirmed');
      expect(mockTaskModel.recoverInterruptedRun).toHaveBeenCalledExactlyOnceWith({
        ...expectedRecovery,
        parkTask: false,
      });
      expect(mockTaskModel.updateStatusForIds).not.toHaveBeenCalled();
    });

"""
replace_once(service_test, marker, addition + marker)

db_test = 'packages/database/src/models/__tests__/taskInterruptedRun.test.ts'
replace_once(
    db_test,
    """      if (fence === 'topic')
        expect(
          (await topicModel.findByTaskId(input.id)).find((t) => t.topicId === 'topic-2')?.status,
        ).toBe('running');
      if (fence === 'operation')
        expect((await topicModel.findByTaskId(input.id))[0].status).toBe('running');
""",
    """      if (fence === 'topic')
        expect(
          (await topicModel.findByTaskId(input.id)).find((t) => t.topicId === 'topic-2')?.status,
        ).toBe('running');
      if (fence === 'reservation')
        expect((await topicModel.findByTaskId(input.id))[0].status).toBe('running');
      if (fence === 'operation')
        expect((await topicModel.findByTaskId(input.id))[0].status).toBe('running');
""",
)

print('PR #26 race repairs applied')
