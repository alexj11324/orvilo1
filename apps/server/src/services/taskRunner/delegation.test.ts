// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaskModel } from '@/database/models/task';
import { TaskDependencyError } from '@/database/models/taskDependency';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { assertAgentVisibleTo } from '@/database/utils/agent-access';
import { assertCanUseWorkspaceAgent } from '@/server/routers/lambda/_helpers/workspaceAgentGuard';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskDispatchService } from '@/server/services/taskDispatch';

import { buildTaskPrompt } from './buildTaskPrompt';
import { TaskRunnerService } from './index';

vi.mock('@/server/services/taskLifecycle', () => ({ TaskLifecycleService: vi.fn() }));
vi.mock('@/server/services/taskWorkspace', () => ({ TaskWorkspaceService: vi.fn() }));
vi.mock('@/database/utils/agent-access', () => ({
  assertAgentVisibleTo: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/server/routers/lambda/_helpers/workspaceAgentGuard', () => ({
  assertCanUseWorkspaceAgent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./buildTaskPrompt', () => ({
  buildTaskPrompt: vi.fn().mockResolvedValue({
    acceptanceEnabled: false,
    fileIds: [],
    prompt: 'do the thing',
  }),
}));

afterEach(() => {
  vi.mocked(assertAgentVisibleTo).mockReset().mockResolvedValue(undefined);
  vi.mocked(assertCanUseWorkspaceAgent).mockReset().mockResolvedValue(undefined);
  vi.restoreAllMocks();
});

const baseTask = (overrides: Partial<TaskItem> = {}): TaskItem =>
  ({
    assigneeAgentId: 'agt_assignee',
    assigneeUserId: null,
    config: {},
    id: 'task-1',
    identifier: 'T-1',
    status: 'backlog',
    workspaceId: 'ws-1',
    ...overrides,
  }) as TaskItem;

/**
 * Stub the whole happy path of a run: resolve → prepare → reserve → dispatch
 * → execAgent succeeds without invoking beforeOperationStart, so the runner
 * registers the topic through its post-dispatch fallback path.
 */
const setupHappyPath = (task: TaskItem, execResult: unknown) => {
  vi.spyOn(TaskModel.prototype, 'resolve').mockResolvedValue(task);
  // Run-start settlement reads and stamps the task through its own model
  // instance — point it at the same fixture row.
  vi.spyOn(TaskModel.prototype, 'findById').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'updateStatusIfReservation').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'updateStatusIfCurrent').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'updateStatus').mockResolvedValue(task);
  vi.spyOn(TaskModel.prototype, 'resolveTaskReviewRequirement').mockResolvedValue(false);
  vi.spyOn(TaskModel.prototype, 'areAllDependenciesCompleted').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'claimRunKickoff').mockResolvedValue(true);
  vi.spyOn(TaskTopicModel.prototype, 'findByTaskId').mockResolvedValue([]);
  vi.spyOn(TaskTopicModel.prototype, 'findByTopicId').mockResolvedValue(null);
  vi.spyOn(TaskModel.prototype, 'reserveRun').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'renewRunReservation').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'updateTaskConfig').mockResolvedValue(null as never);
  vi.spyOn(TaskModel.prototype, 'updateWithLog').mockResolvedValue(null as never);
  vi.spyOn(TaskModel.prototype, 'updateCurrentTopic').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'incrementTopicCount').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'updateHeartbeat').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'releaseRunReservation').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'releaseRunKickoff').mockResolvedValue(undefined);
  vi.spyOn(TaskModel.prototype, 'failRunReservation').mockResolvedValue(undefined as never);
  vi.spyOn(TaskModel.prototype, 'getCheckpointConfig').mockReturnValue({
    onAgentRequest: false,
  } as never);
  vi.spyOn(TaskModel.prototype, 'getReviewConfig').mockReturnValue(undefined);
  vi.spyOn(TaskTopicModel.prototype, 'startRun').mockResolvedValue(undefined as never);
  vi.spyOn(TaskDispatchService.prototype, 'prepare').mockResolvedValue({
    dispatch: { generation: 1, id: 'dsp-1' } as never,
    fence: 1,
    owner: 'test-owner',
    task,
  });
  vi.spyOn(TaskDispatchService.prototype, 'transition').mockResolvedValue(undefined as never);
  vi.spyOn(TaskDispatchService.prototype, 'settle').mockResolvedValue(undefined as never);
  const execAgent = vi
    .spyOn(AiAgentService.prototype, 'execAgent')
    .mockResolvedValue(execResult as never);
  const interruptTask = vi
    .spyOn(AiAgentService.prototype, 'interruptTask')
    .mockResolvedValue({ success: true } as never);
  return { execAgent, interruptTask };
};

const newRunner = (
  overrides: {
    assertMayCommit?: ReturnType<typeof vi.fn>;
    claimExecutionEpoch?: ReturnType<typeof vi.fn>;
    db?: unknown;
    workspaceId?: string | null;
    getAgentModelConfig?: ReturnType<typeof vi.fn>;
    getBuiltinAgent?: ReturnType<typeof vi.fn>;
  } = {},
) => {
  const db = (overrides.db ?? {}) as {
    transaction?: (callback: (tx: unknown) => Promise<void>) => Promise<void>;
  };
  db.transaction ??= async (callback) => callback(db);
  const service = new TaskRunnerService(
    db as never,
    'user-1',
    overrides.workspaceId === null ? undefined : (overrides.workspaceId ?? 'ws-1'),
  );
  const agentModel = {
    getAgentModelConfig:
      overrides.getAgentModelConfig ?? vi.fn().mockResolvedValue({ model: 'm', provider: 'p' }),
    getAgentModelConfigForExecution:
      overrides.getAgentModelConfig ?? vi.fn().mockResolvedValue({ model: 'm', provider: 'p' }),
    getBuiltinAgent: overrides.getBuiltinAgent ?? vi.fn(),
  };
  const delegationService = {
    assertMayCommit: overrides.assertMayCommit ?? vi.fn().mockResolvedValue(undefined),
    claimExecutionEpoch: overrides.claimExecutionEpoch ?? vi.fn().mockResolvedValue(7),
  };
  (service as unknown as { agentModel: unknown }).agentModel = agentModel;
  (service as unknown as { delegationService: unknown }).delegationService = delegationService;
  return { agentModel, delegationService, service };
};

const runParams = {
  delegation: { agentId: 'agt_delegate', grantId: 'grant-1' },
  idempotencyKey: 'k-1',
  taskId: 'task-1',
  // Pin the run's workspace directly so no provisioning runs in tests.
  workspaceOverride: { workingDirectory: '/tmp/wt', workingDirectoryConfig: {} as never },
};

describe('TaskRunnerService delegated runs', () => {
  it('admits a private workspace Agent granted Use without requiring public visibility', async () => {
    const task = baseTask({ visibility: 'public' });
    const { execAgent } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    vi.mocked(assertAgentVisibleTo).mockRejectedValueOnce(new TRPCError({ code: 'NOT_FOUND' }));
    const { service } = newRunner();
    await expect(service.runTask({ ...runParams, delegation: undefined })).resolves.toMatchObject({
      success: true,
    });
    expect(execAgent).toHaveBeenCalledOnce();
  });

  it('denies a visible workspace Agent without Use before policy, reservation or dispatch writes', async () => {
    const task = baseTask({ visibility: 'public' });
    setupHappyPath(task, { operationId: 'op-1', success: true, topicId: 'tpc_1' });
    vi.mocked(assertCanUseWorkspaceAgent).mockRejectedValueOnce(
      new TRPCError({ code: 'FORBIDDEN', message: 'Agent Use denied' }),
    );
    const { service } = newRunner();

    await expect(service.runTask({ ...runParams, delegation: undefined })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(TaskModel.prototype.updateTaskConfig).not.toHaveBeenCalled();
    expect(TaskModel.prototype.claimRunKickoff).not.toHaveBeenCalled();
    expect(TaskDispatchService.prototype.prepare).not.toHaveBeenCalled();
    expect(TaskTopicModel.prototype.startRun).not.toHaveBeenCalled();
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
  });

  it('checks the actual inbox fallback Use before a manual Task dispatch can mutate shared state', async () => {
    const task = baseTask({
      assigneeAgentId: null,
      assigneeUserId: 'human-owner',
      assignmentMode: 'manual',
      orchestrationOwner: 'manual',
      createdBySubjectKind: 'user',
    });
    setupHappyPath(task, { operationId: 'op-1', success: true, topicId: 'tpc_1' });
    const { service } = newRunner({
      getBuiltinAgent: vi.fn().mockResolvedValue({ id: 'agt_inbox' }),
    });
    vi.mocked(assertCanUseWorkspaceAgent).mockRejectedValue(new TRPCError({ code: 'FORBIDDEN' }));
    await expect(service.runTask({ ...runParams, delegation: undefined })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(TaskDispatchService.prototype.prepare).not.toHaveBeenCalled();
    expect(TaskModel.prototype.claimRunKickoff).not.toHaveBeenCalled();
  });

  it('authorizes the actual delegated executor rather than the task assignee', async () => {
    const task = baseTask({ visibility: 'public' });
    setupHappyPath(task, { operationId: 'op-1', success: true, topicId: 'tpc_1' });
    vi.mocked(assertCanUseWorkspaceAgent).mockImplementation(async ({ agentId }) => {
      if (agentId === 'agt_delegate') throw new TRPCError({ code: 'FORBIDDEN' });
    });
    const { service } = newRunner();
    await expect(service.runTask(runParams)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(TaskDispatchService.prototype.prepare).not.toHaveBeenCalled();
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
  });

  it('rejects another user personal Agent before any task mutation or dispatch', async () => {
    const task = baseTask({ workspaceId: null });
    setupHappyPath(task, { operationId: 'op-1', success: true, topicId: 'tpc_1' });
    vi.mocked(assertAgentVisibleTo).mockRejectedValueOnce(
      new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found' }),
    );
    const { service } = newRunner({ workspaceId: null });

    await expect(service.runTask({ ...runParams, delegation: undefined })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(TaskModel.prototype.updateTaskConfig).not.toHaveBeenCalled();
    expect(TaskModel.prototype.claimRunKickoff).not.toHaveBeenCalled();
    expect(TaskDispatchService.prototype.prepare).not.toHaveBeenCalled();
    expect(TaskTopicModel.prototype.startRun).not.toHaveBeenCalled();
    expect(AiAgentService.prototype.execAgent).not.toHaveBeenCalled();
  });

  it('allows the owner to execute a shared task with their usable personal Agent', async () => {
    const task = baseTask({ visibility: 'public' });
    const { execAgent } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const { service } = newRunner();

    await service.runTask({ ...runParams, delegation: undefined });

    expect(assertCanUseWorkspaceAgent).toHaveBeenCalledWith({
      agentId: 'agt_assignee',
      db: expect.anything(),
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
    expect(execAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agt_assignee' }));
  });

  it('executes as the grant agent — not the stored assignee — and fences the run row', async () => {
    const task = baseTask();
    const { execAgent } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const { agentModel, delegationService, service } = newRunner();

    await service.runTask(runParams);

    expect(assertCanUseWorkspaceAgent).toHaveBeenCalledWith({
      agentId: 'agt_delegate',
      db: expect.anything(),
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    // The dispatch binds the delegate — the stored assignee never executes.
    expect(execAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agt_delegate' }));
    expect(execAgent).not.toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agt_assignee' }),
    );
    // Its model snapshot is pinned from the delegate, not the assignee.
    expect(agentModel.getAgentModelConfigForExecution).toHaveBeenCalledWith('agt_delegate');
    expect(agentModel.getBuiltinAgent).not.toHaveBeenCalled();
    // The run row is claimed for the grant and the epoch asserted before the
    // registration commits.
    expect(delegationService.claimExecutionEpoch).toHaveBeenCalledWith(
      {
        grantId: 'grant-1',
        taskId: 'task-1',
        topicId: 'tpc_1',
      },
      expect.anything(),
    );
    expect(delegationService.assertMayCommit).toHaveBeenCalledWith({
      epoch: 7,
      grantId: 'grant-1',
      taskId: 'task-1',
      topicId: 'tpc_1',
    });
  });

  it('does not fall back to the inbox agent when the task has no assignee', async () => {
    const task = baseTask({ assigneeAgentId: null, assigneeUserId: 'user-9' });
    const { execAgent } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const { agentModel, service } = newRunner();

    await service.runTask(runParams);

    // A delegated run on a human-assigned task must still run the delegate —
    // the inbox fallback would silently substitute a different principal.
    expect(execAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agt_delegate' }));
    expect(agentModel.getBuiltinAgent).not.toHaveBeenCalled();
  });

  it('aborts the registration when the claimed epoch has been superseded', async () => {
    const task = baseTask();
    const { interruptTask } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const assertMayCommit = vi.fn().mockRejectedValue(
      new TRPCError({
        code: 'CONFLICT',
        message: 'Execution superseded by a newer delegation epoch',
      }),
    );
    const { service } = newRunner({ assertMayCommit });
    const updateHeartbeat = vi.mocked(TaskModel.prototype.updateHeartbeat);

    await expect(service.runTask(runParams)).rejects.toMatchObject({ code: 'CONFLICT' });

    // The registration never commits — no heartbeat, no durable registration.
    expect(updateHeartbeat).not.toHaveBeenCalled();
    // The orphaned operation started by execAgent is interrupted on teardown.
    expect(interruptTask).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'op-1', topicId: 'tpc_1' }),
    );
  });

  it('does not register an operation after a terminal cascade clears its reservation', async () => {
    const task = baseTask();
    setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const db = {} as { transaction: (callback: (tx: unknown) => Promise<void>) => Promise<void> };
    db.transaction = async (callback) => callback(db);
    const { service } = newRunner({ db });
    const renewRunReservation = vi.mocked(TaskModel.prototype.renewRunReservation);
    renewRunReservation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(AiAgentService.prototype.execAgent).mockImplementationOnce(async (input) => {
      await input.beforeOperationStart?.({ operationId: 'op-1', topicId: 'tpc_1' });
      return { operationId: 'op-1', success: true, topicId: 'tpc_1' } as never;
    });

    await expect(service.runTask(runParams)).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(TaskTopicModel.prototype.startRun).not.toHaveBeenCalled();
    expect(TaskDispatchService.prototype.transition).toHaveBeenCalledTimes(1);
  });

  it('interrupts a fallback operation when a terminal cascade wins before registration', async () => {
    const task = baseTask();
    const { interruptTask } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const { service } = newRunner();
    const renewRunReservation = vi.mocked(TaskModel.prototype.renewRunReservation);
    renewRunReservation
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(service.runTask(runParams)).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(TaskTopicModel.prototype.startRun).not.toHaveBeenCalled();
    expect(interruptTask).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'op-1', topicId: 'tpc_1' }),
    );
  });

  it('releases a dependency-blocked claim back to backlog — not paused', async () => {
    const task = baseTask();
    setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    // Claim-time dependency gate refuses: the upstream has no valid delivery.
    vi.mocked(buildTaskPrompt).mockRejectedValueOnce(
      new TaskDependencyError(
        'Dependency deliveries are not current/valid for: T-9',
        'PRECONDITION_FAILED',
      ),
    );
    const failRunReservation = vi.mocked(TaskModel.prototype.failRunReservation);
    const { service } = newRunner();

    await expect(service.runTask(runParams)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      name: 'TaskDependencyError',
    });

    // 'paused' would drop the task out of getUnlockedTasksForMany discovery
    // forever; a blocked claim must stay claimable for the next completion.
    expect(failRunReservation).toHaveBeenCalledWith(
      task.id,
      expect.any(String),
      'backlog',
      'Dependency deliveries are not current/valid for: T-9',
    );
  });
});
