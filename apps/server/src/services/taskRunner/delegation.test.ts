// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TaskItem } from '@orvilo/types';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { AiAgentService } from '@/server/services/aiAgent';
import { TaskDispatchService } from '@/server/services/taskDispatch';

import { TaskRunnerService } from './index';

vi.mock('@/server/services/taskLifecycle', () => ({ TaskLifecycleService: vi.fn() }));
vi.mock('@/server/services/taskWorkspace', () => ({ TaskWorkspaceService: vi.fn() }));
vi.mock('./buildTaskPrompt', () => ({
  buildTaskPrompt: vi.fn().mockResolvedValue({
    acceptanceEnabled: false,
    fileIds: [],
    prompt: 'do the thing',
  }),
}));

afterEach(() => vi.restoreAllMocks());

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
  vi.spyOn(TaskModel.prototype, 'areAllDependenciesCompleted').mockResolvedValue(true);
  vi.spyOn(TaskModel.prototype, 'claimRunKickoff').mockResolvedValue(true);
  vi.spyOn(TaskTopicModel.prototype, 'findByTaskId').mockResolvedValue([]);
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

const newRunner = (overrides: {
  assertExecutionEpoch?: ReturnType<typeof vi.fn>;
  claimExecutionEpoch?: ReturnType<typeof vi.fn>;
  db?: unknown;
  getAgentModelConfig?: ReturnType<typeof vi.fn>;
  getBuiltinAgent?: ReturnType<typeof vi.fn>;
} = {}) => {
  const db = (overrides.db ?? {}) as {
    transaction?: (callback: (tx: unknown) => Promise<void>) => Promise<void>;
  };
  db.transaction ??= async (callback) => callback(db);
  const service = new TaskRunnerService(db as never, 'user-1', 'ws-1');
  const agentModel = {
    getAgentModelConfig:
      overrides.getAgentModelConfig ?? vi.fn().mockResolvedValue({ model: 'm', provider: 'p' }),
    getBuiltinAgent: overrides.getBuiltinAgent ?? vi.fn(),
  };
  const delegationService = {
    assertExecutionEpoch: overrides.assertExecutionEpoch ?? vi.fn().mockResolvedValue(undefined),
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
  it('executes as the grant agent — not the stored assignee — and fences the run row', async () => {
    const task = baseTask();
    const { execAgent } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const { agentModel, delegationService, service } = newRunner();

    await service.runTask(runParams);

    // The dispatch binds the delegate — the stored assignee never executes.
    expect(execAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agt_delegate' }),
    );
    expect(execAgent).not.toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agt_assignee' }));
    // Its model snapshot is pinned from the delegate, not the assignee.
    expect(agentModel.getAgentModelConfig).toHaveBeenCalledWith('agt_delegate');
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
    expect(delegationService.assertExecutionEpoch).toHaveBeenCalledWith({
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
    expect(execAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agt_delegate' }),
    );
    expect(agentModel.getBuiltinAgent).not.toHaveBeenCalled();
  });

  it('aborts the registration when the claimed epoch has been superseded', async () => {
    const task = baseTask();
    const { interruptTask } = setupHappyPath(task, {
      operationId: 'op-1',
      success: true,
      topicId: 'tpc_1',
    });
    const assertExecutionEpoch = vi
      .fn()
      .mockRejectedValue(
        new TRPCError({ code: 'CONFLICT', message: 'Execution superseded by a newer delegation epoch' }),
      );
    const { service } = newRunner({ assertExecutionEpoch });
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
});
