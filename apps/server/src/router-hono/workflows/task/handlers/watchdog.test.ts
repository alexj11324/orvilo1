// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { watchdog } from './watchdog';

type RunningTopic = { operationId?: null | string; status: string; topicId?: string };
type WatchdogTask = {
  assigneeAgentId: null | string;
  createdByUserId: string;
  heartbeatTimeout: number;
  id: string;
  identifier: string;
  workspaceId: null | string;
};
type WatchdogUpdate = { id: string };

const {
  briefCreate,
  cancelIfRunning,
  cleanupTaskWorktrees,
  findByTaskId,
  findStuckTasks,
  interruptTask,
  updateStatus,
  updateStatusIfCurrent,
  updateStatusIfReservation,
  sweepTaskCancellations,
} = vi.hoisted(() => ({
  briefCreate: vi.fn<(input: unknown) => Promise<unknown>>(),
  cancelIfRunning: vi.fn<(taskId: string, topicId: string) => Promise<boolean>>(),
  cleanupTaskWorktrees: vi.fn<(taskId: string) => Promise<void>>(),
  findByTaskId: vi.fn<(taskId: string) => Promise<RunningTopic[]>>(),
  findStuckTasks: vi.fn<() => Promise<WatchdogTask[]>>(),
  interruptTask:
    vi.fn<
      (params: {
        operationId?: string;
      }) => Promise<{ deviceCancellationConfirmed?: boolean; success: boolean }>
    >(),
  updateStatus: vi.fn<(id: string, status: string, extra?: unknown) => Promise<unknown>>(),
  updateStatusIfCurrent:
    vi.fn<
      (
        id: string,
        currentStatus: string,
        status: string,
        extra?: unknown,
      ) => Promise<null | WatchdogUpdate>
    >(),
  updateStatusIfReservation:
    vi.fn<
      (
        id: string,
        reservationId: string,
        currentStatus: string,
        status: string,
        extra?: unknown,
      ) => Promise<null | WatchdogUpdate>
    >(),
  sweepTaskCancellations: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock('@/database/server', () => ({ getServerDB: vi.fn().mockResolvedValue({}) }));
vi.mock('@/database/models/task', () => ({
  TaskModel: Object.assign(
    vi.fn(function () {
      return { updateStatus, updateStatusIfCurrent, updateStatusIfReservation };
    }),
    { findStuckTasks },
  ),
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(function () {
    return { cancelIfRunning, findByTaskId };
  }),
}));
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn(function () {
    return { interruptTask };
  }),
}));
vi.mock('@/server/services/taskIntegration', () => ({
  TaskIntegrationService: vi.fn(function () {
    return { cleanupTaskWorktrees };
  }),
}));
vi.mock('@/server/services/taskCancellation', () => ({ sweepTaskCancellations }));
vi.mock('@/database/models/brief', () => ({
  BriefModel: vi.fn(function () {
    return { create: briefCreate };
  }),
}));
vi.mock('@/server/services/taskResultBridge/redisStore', () => ({
  TaskResultCallbackRedisStore: Object.assign(vi.fn(), {
    findRecoverableScopes: vi.fn().mockResolvedValue([]),
  }),
}));
vi.mock('@/server/services/taskResultBridge', () => ({ TaskResultBridgeService: vi.fn() }));

const stuckTask: WatchdogTask = {
  assigneeAgentId: 'agent-1',
  createdByUserId: 'user-1',
  heartbeatTimeout: 60,
  id: 'task-1',
  identifier: 'TASK-1',
  workspaceId: null,
};

const context = () =>
  ({
    json: vi.fn((body: unknown, status = 200) => ({ body, status })),
  }) as any;

describe('task watchdog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findStuckTasks.mockResolvedValue([stuckTask]);
    findByTaskId.mockResolvedValue([]);
    interruptTask.mockResolvedValue({ success: true });
    sweepTaskCancellations.mockResolvedValue([]);
    updateStatusIfCurrent.mockResolvedValue({ id: 'task-1' });
    updateStatusIfReservation.mockResolvedValue({ id: 'task-1' });
  });

  it('does not declare failure while the timed-out generation still owns a running topic', async () => {
    findByTaskId.mockResolvedValue([
      { operationId: 'op-1', status: 'running', topicId: 'topic-1' },
    ]);
    interruptTask.mockResolvedValue({
      deviceCancellationConfirmed: false,
      success: false,
    });

    const response = await watchdog(context());

    expect(response.body).toMatchObject({
      canceled: [],
      cancellationRequired: ['TASK-1'],
      failed: [],
      success: true,
    });
    expect(updateStatus).not.toHaveBeenCalled();
    expect(briefCreate).not.toHaveBeenCalled();
  });

  it('marks a heartbeat-expired task failed once no running generation remains', async () => {
    findByTaskId.mockResolvedValue([{ status: 'completed', topicId: 'topic-1' }]);

    const response = await watchdog(context());

    expect(response.body).toMatchObject({ cancellationRequired: [], failed: ['TASK-1'] });
    expect(updateStatusIfCurrent).toHaveBeenCalledWith(
      'task-1',
      'running',
      'failed',
      expect.objectContaining({ error: 'Heartbeat timeout' }),
    );
    expect(cleanupTaskWorktrees).toHaveBeenCalledWith('task-1');
    expect(briefCreate).toHaveBeenCalledTimes(1);
  });

  it('interrupts and reclaims a timed-out task when every running operation confirms cancellation', async () => {
    findByTaskId.mockResolvedValue([
      { operationId: 'op-1', status: 'running', topicId: 'topic-1' },
      { operationId: 'op-2', status: 'running', topicId: 'topic-2' },
    ]);

    const response = await watchdog(context());

    expect(interruptTask).toHaveBeenCalledTimes(2);
    expect(interruptTask).toHaveBeenNthCalledWith(1, { operationId: 'op-1' });
    expect(interruptTask).toHaveBeenNthCalledWith(2, { operationId: 'op-2' });
    expect(cancelIfRunning).toHaveBeenCalledWith('task-1', 'topic-1');
    expect(cancelIfRunning).toHaveBeenCalledWith('task-1', 'topic-2');
    expect(response.body).toMatchObject({ canceled: ['TASK-1'], failed: ['TASK-1'] });
    expect(cleanupTaskWorktrees).toHaveBeenCalledWith('task-1');
  });

  it('settles each confirmed operation before retrying an unconfirmed sibling', async () => {
    findByTaskId.mockResolvedValue([
      { operationId: 'op-1', status: 'running', topicId: 'topic-1' },
      { operationId: 'op-2', status: 'running', topicId: 'topic-2' },
    ]);
    interruptTask.mockImplementation(async ({ operationId }) => ({
      success: operationId === 'op-1',
    }));

    const response = await watchdog(context());

    expect(cancelIfRunning).toHaveBeenCalledWith('task-1', 'topic-1');
    expect(cancelIfRunning).not.toHaveBeenCalledWith('task-1', 'topic-2');
    expect(response.body).toMatchObject({
      cancellationRequired: ['TASK-1'],
      failed: [],
    });
    expect(cleanupTaskWorktrees).not.toHaveBeenCalled();
  });

  it('preserves the task and worktrees when device cancellation is not confirmed', async () => {
    findByTaskId.mockResolvedValue([
      { operationId: 'op-1', status: 'running', topicId: 'topic-1' },
    ]);
    interruptTask.mockResolvedValue({
      deviceCancellationConfirmed: false,
      success: false,
    });

    const response = await watchdog(context());

    expect(response.body).toMatchObject({
      canceled: [],
      cancellationRequired: ['TASK-1'],
      failed: [],
    });
    expect(cancelIfRunning).not.toHaveBeenCalled();
    expect(updateStatusIfCurrent).not.toHaveBeenCalled();
    expect(updateStatusIfReservation).not.toHaveBeenCalled();
    expect(cleanupTaskWorktrees).not.toHaveBeenCalled();
    expect(briefCreate).not.toHaveBeenCalled();
  });

  it('requires cancellation when a running topic has no operation identity', async () => {
    findByTaskId.mockResolvedValue([{ status: 'running', topicId: 'topic-1' }]);

    const response = await watchdog(context());

    expect(response.body).toMatchObject({ cancellationRequired: ['TASK-1'], failed: [] });
    expect(interruptTask).not.toHaveBeenCalled();
    expect(cancelIfRunning).not.toHaveBeenCalled();
    expect(cleanupTaskWorktrees).not.toHaveBeenCalled();
  });
});
