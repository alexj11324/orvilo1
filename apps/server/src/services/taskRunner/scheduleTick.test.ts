// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BriefModel } from '@/database/models/brief';
import { TaskModel } from '@/database/models/task';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { taskDispatches } from '@/database/schemas';

import { TaskRunnerService } from './index';
import { scheduleOccurrenceToken } from './scheduleOccurrence';
import { runScheduleTick } from './scheduleTick';

const mockSelectTask = vi.fn();
const mockSelectDispatch = vi.fn();

vi.mock('@/database/server', () => ({
  getServerDB: vi.fn().mockResolvedValue({
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => (table === taskDispatches ? mockSelectDispatch() : mockSelectTask()),
        }),
      }),
    }),
  }),
}));

vi.mock('@/database/models/task', () => ({
  TaskModel: vi.fn(),
}));

vi.mock('@/database/models/taskTopic', () => ({
  TaskTopicModel: vi.fn(),
}));

vi.mock('@/database/models/brief', () => ({
  BriefModel: vi.fn(),
}));

vi.mock('./index', () => ({
  TaskRunnerService: vi.fn(),
}));

describe('runScheduleTick', () => {
  const taskId = 'task-1';
  const userId = 'user-1';
  const tickToken = scheduleOccurrenceToken({
    taskId,
    pattern: '*/5 * * * *',
    timezone: 'UTC',
    plannedAt: new Date('2026-05-02T00:00:00Z'),
  });

  const mockTaskModel = {
    updateStatus: vi.fn(),
  };
  const mockTaskTopicModel = {
    countByTask: vi.fn(),
  };
  const mockBriefModel = {
    hasUnresolvedUrgentByTask: vi.fn().mockResolvedValue(false),
  };
  const mockRunner = {
    runTask: vi.fn(),
  };

  const baseTask = (overrides: Partial<Record<string, unknown>> = {}) => ({
    automationMode: 'schedule',
    config: {},
    context: { scheduler: { scheduleStartedAt: new Date('2026-05-01T00:00:00Z').toISOString() } },
    executionGeneration: 0,
    id: taskId,
    identifier: 'T-1',
    schedulePattern: '*/5 * * * *',
    scheduleTimezone: 'UTC',
    status: 'scheduled',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectTask.mockResolvedValue([]);
    mockSelectDispatch.mockReset().mockResolvedValue([]);
    mockBriefModel.hasUnresolvedUrgentByTask.mockResolvedValue(false);
    (TaskModel as any).mockImplementation(function () {
      return mockTaskModel;
    });
    (TaskTopicModel as any).mockImplementation(function () {
      return mockTaskTopicModel;
    });
    (BriefModel as any).mockImplementation(function () {
      return mockBriefModel;
    });
    (TaskRunnerService as any).mockImplementation(function () {
      return mockRunner;
    });
  });

  it('skips not-found tasks', async () => {
    mockSelectTask.mockResolvedValue([]);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: false, reason: 'not-found' });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it('skips when automationMode has been changed away from schedule', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ automationMode: 'heartbeat' })]);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: false, reason: 'mode-changed' });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it('skips terminal / paused tasks before checking maxExecutions', async () => {
    // `status` is retired — a pause lives on the parked marker now.
    mockSelectTask.mockResolvedValue([
      baseTask({
        context: {
          execution: { parked: { at: '2026-05-02T00:00:00.000Z' } },
          scheduler: { scheduleStartedAt: new Date('2026-05-01T00:00:00Z').toISOString() },
        },
      }),
    ]);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: false, reason: 'paused' });
    expect(mockTaskTopicModel.countByTask).not.toHaveBeenCalled();
  });

  it('rejects a tokenless queue message instead of using the current generation', async () => {
    mockSelectTask.mockResolvedValue([baseTask()]);
    expect(await runScheduleTick(taskId, userId)).toEqual({ ran: false, reason: 'stale-tick' });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it('rejects a plan token after the schedule configuration has changed', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ scheduleTimezone: 'Asia/Shanghai' })]);
    expect(await runScheduleTick(taskId, userId, tickToken)).toEqual({
      ran: false,
      reason: 'stale-tick',
    });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });

  it('executes an already queued occurrence with its frozen plan and stop policy after an edit', async () => {
    mockSelectTask.mockResolvedValue([
      baseTask({
        schedulePattern: '0 10 * * *',
        scheduleTimezone: 'Asia/Shanghai',
        config: { schedule: { maxExecutions: 1 } },
      }),
    ]);
    mockSelectDispatch.mockResolvedValue([
      {
        automationOccurrence: {
          definition: {
            schedulePattern: '*/5 * * * *',
            scheduleTimezone: 'UTC',
            config: { schedule: { maxExecutions: 10 } },
            instruction: 'Original published instruction',
          },
        },
      },
    ]);
    mockTaskTopicModel.countByTask.mockResolvedValue(7);
    mockRunner.runTask.mockResolvedValue(undefined);
    expect(await runScheduleTick(taskId, userId, tickToken)).toEqual({
      ran: true,
      taskIdentifier: 'T-1',
    });
    expect(mockRunner.runTask).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `schedule:tick:${tickToken}`,
        intent: 'fresh_occurrence',
      }),
    );
    expect(mockTaskModel.updateStatus).not.toHaveBeenCalled();
  });

  it('uses the same occurrence identity after execution generation changes', async () => {
    mockSelectTask
      .mockResolvedValueOnce([baseTask()])
      .mockResolvedValueOnce([baseTask({ executionGeneration: 19 })]);
    mockRunner.runTask.mockResolvedValue(undefined);
    await runScheduleTick(taskId, userId, tickToken);
    await runScheduleTick(taskId, userId, tickToken);
    expect(mockRunner.runTask.mock.calls[0][0].idempotencyKey).toBe(
      mockRunner.runTask.mock.calls[1][0].idempotencyKey,
    );
  });

  it('runs the task when no maxExecutions is configured', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ config: {} })]);
    mockRunner.runTask.mockResolvedValue(undefined);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: true, taskIdentifier: 'T-1' });
    expect(mockBriefModel.hasUnresolvedUrgentByTask).toHaveBeenCalledWith(taskId, {
      excludeTypes: ['error'],
    });
    expect(mockTaskTopicModel.countByTask).not.toHaveBeenCalled();
    expect(mockRunner.runTask).toHaveBeenCalledWith({
      intent: 'fresh_occurrence',
      idempotencyKey: `schedule:tick:${tickToken}`,
      taskId,
      trigger: 'schedule',
    });
  });

  it('runs the task when the run count is still under maxExecutions', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ config: { schedule: { maxExecutions: 10 } } })]);
    mockTaskTopicModel.countByTask.mockResolvedValue(7);
    mockRunner.runTask.mockResolvedValue(undefined);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: true, taskIdentifier: 'T-1' });
    // Quota counts only scheduled ticks, not ad-hoc manual runs.
    expect(mockTaskTopicModel.countByTask).toHaveBeenCalledWith(taskId, {
      since: new Date('2026-05-01T00:00:00Z'),
      triggers: ['schedule'],
    });
    expect(mockRunner.runTask).toHaveBeenCalledWith({
      intent: 'fresh_occurrence',
      idempotencyKey: `schedule:tick:${tickToken}`,
      taskId,
      trigger: 'schedule',
    });
    expect(mockTaskModel.updateStatus).not.toHaveBeenCalled();
  });

  it('marks the task completed and skips when the run count has reached maxExecutions', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ config: { schedule: { maxExecutions: 10 } } })]);
    mockTaskTopicModel.countByTask.mockResolvedValue(10);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: false, reason: 'max-executions-reached' });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
    expect(mockTaskModel.updateStatus).toHaveBeenCalledWith(taskId, 'completed', {
      completedAt: expect.any(Date),
    });
  });

  it('falls back to running when maxExecutions is set but scheduleStartedAt is missing', async () => {
    // Pre-existing scheduled tasks (created before this PR) won't have a
    // scheduleStartedAt stamp. They should still tick normally; the cap will
    // start enforcing once the user pauses + restarts.
    mockSelectTask.mockResolvedValue([
      baseTask({ config: { schedule: { maxExecutions: 10 } }, context: {} }),
    ]);
    mockRunner.runTask.mockResolvedValue(undefined);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: true, taskIdentifier: 'T-1' });
    expect(mockTaskTopicModel.countByTask).not.toHaveBeenCalled();
    expect(mockRunner.runTask).toHaveBeenCalled();
  });

  it('returns in-flight when runTask raises a CONFLICT', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ config: {} })]);
    mockRunner.runTask.mockRejectedValue(new TRPCError({ code: 'CONFLICT', message: 'busy' }));

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: false, reason: 'in-flight' });
  });

  it('skips when a human is waiting on an urgent brief', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ config: {} })]);
    mockBriefModel.hasUnresolvedUrgentByTask.mockResolvedValue(true);

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: false, reason: 'human-waiting' });
    expect(mockBriefModel.hasUnresolvedUrgentByTask).toHaveBeenCalledWith(taskId, {
      excludeTypes: ['error'],
    });
    expect(mockRunner.runTask).not.toHaveBeenCalled();
  });
});
