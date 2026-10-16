// @vitest-environment node
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskDomainError } from '@/database/errors/task';
import { BriefModel } from '@/database/models/brief';
import { TaskModel } from '@/database/models/task';
import { TaskDispatchModel } from '@/database/models/taskDispatch';
import { TaskTopicModel } from '@/database/models/taskTopic';
import { taskDispatches } from '@/database/schemas';
import { TaskService } from '@/server/services/task';
import { TaskDispatchQueuedError } from '@/server/services/taskDispatch';

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

vi.mock('@/database/models/taskDispatch', () => ({ TaskDispatchModel: vi.fn() }));
vi.mock('@/server/services/task', () => ({ TaskService: vi.fn() }));

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

  const mockIssueService = { updateStatus: vi.fn() };
  const mockDispatchModel = { countAutomationOccurrencesSince: vi.fn() };
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
    vi.mocked(TaskService).mockImplementation(function () {
      return mockIssueService as any;
    });
    vi.mocked(TaskDispatchModel).mockImplementation(function () {
      return mockDispatchModel as any;
    });
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
          scheduler: {
            automationPaused: true,
            scheduleStartedAt: new Date('2026-05-01T00:00:00Z').toISOString(),
          },
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
    expect(mockBriefModel.hasUnresolvedUrgentByTask).not.toHaveBeenCalled();
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

  it('stops further captures at the confirmed Issue occurrence cap without completing its delivery', async () => {
    mockSelectTask.mockResolvedValue([
      baseTask({
        config: { schedule: { maxExecutions: 1 } },
        context: {
          issuePlan: { confirmedAt: 'confirmed' },
          scheduler: { scheduleStartedAt: '2026-05-01T00:00:00Z' },
        },
      }),
    ]);
    mockDispatchModel.countAutomationOccurrencesSince.mockResolvedValue(1);
    expect(await runScheduleTick(taskId, userId, tickToken)).toEqual({
      ran: false,
      reason: 'max-executions-reached',
    });
    expect(mockIssueService.updateStatus).not.toHaveBeenCalled();
    expect(mockTaskModel.updateStatus).not.toHaveBeenCalled();
    expect(mockTaskTopicModel.countByTask).not.toHaveBeenCalled();
  });

  it('runs an already captured tick at the cap rather than stranding its delivery', async () => {
    mockSelectTask.mockResolvedValue([
      baseTask({
        config: { schedule: { maxExecutions: 1 } },
        context: {
          issuePlan: { confirmedAt: 'confirmed' },
          scheduler: { scheduleStartedAt: '2026-05-01T00:00:00Z' },
        },
      }),
    ]);
    mockSelectDispatch.mockResolvedValue([{ id: 'first-captured' }]);
    mockDispatchModel.countAutomationOccurrencesSince.mockResolvedValue(1);
    expect(await runScheduleTick(taskId, userId, tickToken)).toMatchObject({ ran: true });
    expect(mockIssueService.updateStatus).not.toHaveBeenCalled();
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

  it.each([TRPCError, TaskDomainError])(
    'returns in-flight when runTask raises a %s CONFLICT',
    async (ErrorType) => {
      mockSelectTask.mockResolvedValue([baseTask({ config: {} })]);
      mockRunner.runTask.mockRejectedValue(new ErrorType({ code: 'CONFLICT', message: 'busy' }));

      const outcome = await runScheduleTick(taskId, userId, tickToken);

      expect(outcome).toEqual({ ran: false, reason: 'in-flight' });
    },
  );

  it('retains a trigger while the current round waits for human acceptance', async () => {
    mockSelectTask.mockResolvedValue([baseTask({ config: {} })]);
    mockRunner.runTask.mockRejectedValue(
      new TRPCError({ code: 'CONFLICT', cause: new TaskDispatchQueuedError('queued-2') }),
    );

    const outcome = await runScheduleTick(taskId, userId, tickToken);

    expect(outcome).toEqual({ ran: false, reason: 'queued' });
    expect(mockBriefModel.hasUnresolvedUrgentByTask).not.toHaveBeenCalled();
    expect(mockRunner.runTask).toHaveBeenCalledOnce();
  });
});
