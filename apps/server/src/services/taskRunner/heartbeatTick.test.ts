// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BriefModel } from '@/database/models/brief';
import { TaskDependencyError } from '@/database/models/taskDependency';

import { runHeartbeatTick } from './heartbeatTick';
import { TaskRunnerService } from './index';

const { mockSelectTask, mockSetTaskSchedulerExecutionCallback } = vi.hoisted(() => ({
  mockSelectTask: vi.fn(),
  mockSetTaskSchedulerExecutionCallback: vi.fn(),
}));

const { commitTick, scheduleTick, cancelTick } = vi.hoisted(() => ({
  commitTick: vi.fn(),
  scheduleTick: vi.fn(),
  cancelTick: vi.fn(),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(function () {
    return { updateContextIfHeartbeatTick: commitTick };
  }),
}));

vi.mock('@/database/server', () => ({
  getServerDB: vi.fn().mockResolvedValue({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockSelectTask(),
        }),
      }),
    }),
  }),
}));

vi.mock('@/database/models/brief', () => ({
  BriefModel: vi.fn(),
}));

vi.mock('@/server/services/taskScheduler', () => ({
  setTaskSchedulerExecutionCallback: mockSetTaskSchedulerExecutionCallback,
  createTaskSchedulerModule: () => ({
    scheduleNextTopic: scheduleTick,
    cancelScheduled: cancelTick,
  }),
}));

vi.mock('./index', () => ({
  TaskRunnerService: vi.fn(),
}));

describe('runHeartbeatTick', () => {
  const taskId = 'task-1';
  const userId = 'user-1';

  const mockBriefModel = {
    hasUnresolvedUrgentByTask: vi.fn().mockResolvedValue(false),
  };
  const mockRunner = {
    runTask: vi.fn(),
  };

  const baseTask = (overrides: Partial<Record<string, unknown>> = {}) => ({
    automationMode: 'heartbeat',
    executionGeneration: 0,
    heartbeatInterval: 30,
    id: taskId,
    identifier: 'T-1',
    status: 'scheduled',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    commitTick.mockReset().mockResolvedValue(true);
    scheduleTick.mockReset().mockResolvedValue('next-message');
    cancelTick.mockReset().mockResolvedValue(undefined);
    mockRunner.runTask.mockReset();
    mockSelectTask.mockResolvedValue([]);
    mockBriefModel.hasUnresolvedUrgentByTask.mockResolvedValue(false);
    (BriefModel as any).mockImplementation(function () {
      return mockBriefModel;
    });
    (TaskRunnerService as any).mockImplementation(function () {
      return mockRunner;
    });
  });

  it('durably re-arms a blocked heartbeat without creating an execution', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ context: { scheduler: { tickToken: 'old' } } })]);
    mockRunner.runTask.mockRejectedValue(new TaskDependencyError('Blocked', 'PRECONDITION_FAILED'));
    expect(await runHeartbeatTick(taskId, userId, 'old')).toEqual({
      ran: false,
      reason: 'dependencies-blocked',
    });
    expect(scheduleTick).toHaveBeenCalledWith({
      delay: 30,
      taskId,
      userId,
      tickToken: expect.any(String),
    });
    expect(commitTick).toHaveBeenCalledWith(
      taskId,
      'old',
      30,
      expect.objectContaining({ tickMessageId: 'next-message' }),
    );
    expect(cancelTick).not.toHaveBeenCalled();
  });

  it('re-arms when a project policy temporarily rejects the heartbeat', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ context: { scheduler: { tickToken: 'old' } } })]);
    mockRunner.runTask.mockRejectedValue(
      new TRPCError({ code: 'PRECONDITION_FAILED', message: 'project_auto_dispatch_disabled' }),
    );

    expect(await runHeartbeatTick(taskId, userId, 'old')).toEqual({
      ran: false,
      reason: 'human-waiting',
    });
    expect(scheduleTick).toHaveBeenCalledWith({
      delay: 30,
      taskId,
      userId,
      tickToken: expect.any(String),
    });
    expect(commitTick).toHaveBeenCalledWith(
      taskId,
      'old',
      30,
      expect.objectContaining({ tickMessageId: 'next-message' }),
    );
  });

  it('cancels the deferred message when pause or a newer tick wins the CAS', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    mockRunner.runTask.mockRejectedValue(new TaskDependencyError('Blocked', 'PRECONDITION_FAILED'));
    commitTick.mockResolvedValue(false);
    await runHeartbeatTick(taskId, userId);
    expect(cancelTick).toHaveBeenCalledWith('next-message');
  });

  it('propagates queue failures instead of falsely claiming a deferred tick', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    mockRunner.runTask.mockRejectedValue(new TaskDependencyError('Blocked', 'PRECONDITION_FAILED'));
    scheduleTick.mockRejectedValue(new Error('queue offline'));
    await expect(runHeartbeatTick(taskId, userId)).rejects.toThrow('queue offline');
    expect(commitTick).not.toHaveBeenCalled();
  });

  it('does not resume or re-arm an explicitly paused task', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ status: 'paused' })]);
    expect(await runHeartbeatTick(taskId, userId)).toEqual({ ran: false, reason: 'paused' });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
    expect(scheduleTick).not.toHaveBeenCalled();
  });

  it('runs the task and excludes transient error briefs from tick gating', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    mockRunner.runTask.mockResolvedValue(undefined);

    const outcome = await runHeartbeatTick(taskId, userId);

    expect(outcome).toEqual({ ran: true, taskIdentifier: 'T-1' });
    expect(mockBriefModel.hasUnresolvedUrgentByTask).toHaveBeenCalledWith(taskId, {
      excludeTypes: ['error'],
    });
    expect(mockRunner.runTask).toHaveBeenCalledWith({
      idempotencyKey: `heartbeat:tick:task:${taskId}:generation:1`,
      taskId,
      trigger: 'heartbeat',
    });
  });

  it('still skips when a non-error urgent brief requires human input', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    mockBriefModel.hasUnresolvedUrgentByTask.mockResolvedValue(true);

    const outcome = await runHeartbeatTick(taskId, userId);

    expect(outcome).toEqual({ ran: false, reason: 'human-waiting' });
    expect(mockBriefModel.hasUnresolvedUrgentByTask).toHaveBeenCalledWith(taskId, {
      excludeTypes: ['error'],
    });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it('skips a stale tick whose generation token no longer matches', async () => {
    mockSelectTask.mockResolvedValue([
      baseTask({ context: { scheduler: { tickToken: 'tick-current' } } }),
    ]);

    const outcome = await runHeartbeatTick(taskId, userId, 'tick-old');

    expect(outcome).toEqual({ ran: false, reason: 'stale-tick' });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it('allows legacy tokenless ticks when no active generation is stored', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ context: {} })]);
    mockRunner.runTask.mockResolvedValue(undefined);

    const outcome = await runHeartbeatTick(taskId, userId);

    expect(outcome).toEqual({ ran: true, taskIdentifier: 'T-1' });
  });

  it('returns in-flight when runTask raises a CONFLICT', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    mockRunner.runTask.mockRejectedValue(new TRPCError({ code: 'CONFLICT', message: 'busy' }));

    const outcome = await runHeartbeatTick(taskId, userId);

    expect(outcome).toEqual({ ran: false, reason: 'in-flight' });
  });
});
