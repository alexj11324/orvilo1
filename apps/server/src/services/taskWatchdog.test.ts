// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runTaskWatchdog } from './taskWatchdog';

const mocks = vi.hoisted(() => ({
  briefCreate: vi.fn(),
  cancelIfRunning: vi.fn(),
  cleanupTaskWorktrees: vi.fn(),
  drain: vi.fn(),
  findById: vi.fn(),
  findByTaskId: vi.fn(),
  findRecoverableScopes: vi.fn(),
  findStuckTasks: vi.fn(),
  interruptTask: vi.fn(),
  requestStop: vi.fn(),
  runTaskDeliveryReviewSweep: vi.fn(),
  sweepPendingIntegrations: vi.fn(),
  resolveTaskReviewRequirement: vi.fn(),
  updateContext: vi.fn(),
  updateStatus: vi.fn(),
  updateStatusForExecutionContract: vi.fn(),
  updateStatusIfCurrent: vi.fn(),
  updateStatusIfReservation: vi.fn(),
}));

vi.mock('@/database/models/brief', () => ({
  BriefModel: vi.fn(function () {
    return { create: mocks.briefCreate };
  }),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: Object.assign(
    vi.fn(function () {
      return {
        findById: mocks.findById,
        resolveTaskReviewRequirement: mocks.resolveTaskReviewRequirement,
        updateContext: mocks.updateContext,
        updateStatus: mocks.updateStatus,
        updateStatusForExecutionContract: mocks.updateStatusForExecutionContract,
        updateStatusIfCurrent: mocks.updateStatusIfCurrent,
        updateStatusIfReservation: mocks.updateStatusIfReservation,
      };
    }),
    { findStuckTasks: mocks.findStuckTasks },
  ),
}));
vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: vi.fn(function () {
    return { requestStop: mocks.requestStop };
  }),
}));
vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(function () {
    return { cancelIfRunning: mocks.cancelIfRunning, findByTaskId: mocks.findByTaskId };
  }),
}));
vi.mock('@/server/services/aiAgent', () => ({
  AiAgentService: vi.fn(function () {
    return { interruptTask: mocks.interruptTask };
  }),
}));
vi.mock('@/server/services/taskDeliveryReview', () => ({
  runTaskDeliveryReviewSweep: mocks.runTaskDeliveryReviewSweep,
}));
vi.mock('@/server/services/taskIntegration', () => ({
  TaskIntegrationService: vi.fn(function () {
    return {
      cleanupTaskWorktrees: mocks.cleanupTaskWorktrees,
      sweepPendingIntegrations: mocks.sweepPendingIntegrations,
    };
  }),
}));
vi.mock('@/server/services/taskResultBridge', () => ({
  TaskResultBridgeService: vi.fn(function () {
    return { drain: mocks.drain };
  }),
}));
vi.mock('@/server/services/taskResultBridge/redisStore', () => ({
  TaskResultCallbackRedisStore: Object.assign(
    vi.fn(function () {
      return { resetStaleProcessing: vi.fn() };
    }),
    { findRecoverableScopes: mocks.findRecoverableScopes },
  ),
}));

const stuckTask = (overrides: Record<string, unknown> = {}) => ({
  assigneeAgentId: 'agent-1',
  context: {},
  createdBySubjectId: null,
  createdByUserId: 'user-1',
  heartbeatTimeout: 60,
  id: 'task-1',
  identifier: 'TASK-1',
  runReservationId: null,
  workspaceId: 'workspace-1',
  ...overrides,
});

const runningTopic = (overrides: Record<string, unknown> = {}) => ({
  dispatchFence: 4,
  dispatchId: 'dispatch-1',
  executionGeneration: 3,
  operationId: 'operation-1',
  status: 'running',
  taskId: 'task-1',
  topicId: 'topic-1',
  ...overrides,
});

describe('runTaskWatchdog cancellation convergence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.briefCreate.mockResolvedValue({});
    mocks.findByTaskId.mockResolvedValue([runningTopic()]);
    mocks.findRecoverableScopes.mockResolvedValue([]);
    mocks.findStuckTasks.mockResolvedValue([stuckTask()]);
    mocks.interruptTask.mockResolvedValue({ cancelState: 'unknown', success: false });
    mocks.requestStop.mockResolvedValue({ id: 'dispatch-1' });
    mocks.runTaskDeliveryReviewSweep.mockResolvedValue({
      checked: 0,
      corrected: [],
      merged: [],
      paused: [],
      waiting: [],
    });
    mocks.sweepPendingIntegrations.mockResolvedValue({
      blocked: [],
      completed: [],
      held: [],
    });
    mocks.updateContext.mockResolvedValue({});
    mocks.findById.mockResolvedValue(stuckTask({ status: 'running' }));
    mocks.resolveTaskReviewRequirement.mockResolvedValue(false);
    mocks.updateStatus.mockResolvedValue({ id: 'task-1' });
    mocks.updateStatusForExecutionContract.mockResolvedValue({ id: 'task-1' });
    mocks.updateStatusIfCurrent.mockResolvedValue({ id: 'task-1' });
    mocks.updateStatusIfReservation.mockResolvedValue({ id: 'task-1' });
  });

  it('hands an unconfirmed-cancel running topic to the bounded cancellation sweep', async () => {
    const result = await runTaskWatchdog({} as never);

    expect(mocks.requestStop).toHaveBeenCalledWith({
      dispatchId: 'dispatch-1',
      fence: 4,
      generation: 3,
      operationId: 'operation-1',
      reason: 'watchdog_heartbeat_timeout',
    });
    // The dispatch is fenced; no unconfirmed-attempt counter is burned and
    // the task stays running while the bounded sweep interrupts it.
    expect(mocks.updateContext).not.toHaveBeenCalled();
    expect(mocks.updateStatusIfCurrent).not.toHaveBeenCalled();
    expect(result.cancellationRequired).toEqual(['TASK-1']);
  });

  it('counts unconfirmed attempts for dispatch-less topics', async () => {
    mocks.findByTaskId.mockResolvedValue([
      runningTopic({ dispatchFence: null, dispatchId: null, executionGeneration: null }),
    ]);

    await runTaskWatchdog({} as never);

    expect(mocks.requestStop).not.toHaveBeenCalled();
    expect(mocks.updateContext).toHaveBeenCalledWith('task-1', {
      watchdogCancel: { unconfirmedAttempts: 1 },
    });
    expect(mocks.updateStatusIfCurrent).not.toHaveBeenCalled();
  });

  it('parks the task for manual review once unconfirmed attempts hit the bound', async () => {
    mocks.findByTaskId.mockResolvedValue([
      runningTopic({ dispatchFence: null, dispatchId: null, executionGeneration: null }),
    ]);
    mocks.findStuckTasks.mockResolvedValue([
      stuckTask({ context: { watchdogCancel: { unconfirmedAttempts: 2 } } }),
    ]);

    const result = await runTaskWatchdog({} as never);

    expect(mocks.updateContext).toHaveBeenCalledWith('task-1', {
      watchdogCancel: { unconfirmedAttempts: 3 },
    });
    expect(mocks.updateStatusIfCurrent).toHaveBeenCalledWith(
      'task-1',
      'running',
      'paused',
      expect.objectContaining({ error: 'Watchdog cancellation unconfirmed' }),
    );
    expect(mocks.briefCreate).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'urgent', type: 'error' }),
    );
    expect(result.cancellationRequired).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});
