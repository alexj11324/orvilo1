// @vitest-environment node
import type { TaskItem } from '@orvilo/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotAutomationDefinition } from '@/database/utils/automationOccurrence';
import { scheduleOccurrenceToken } from '@/server/services/taskRunner/scheduleOccurrence';

import { runScheduleDispatch } from './scheduleDispatch';

const { getScheduledTasks, enqueue, request } = vi.hoisted(() => ({
  getScheduledTasks: vi.fn(),
  enqueue: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@/database/models/task', () => ({ TaskModel: { getScheduledTasks } }));
vi.mock('@/database/models/taskDispatch', () => ({
  TaskDispatchModel: vi.fn(function () {
    return { request };
  }),
}));
vi.mock('@/database/server', () => ({ getServerDB: async () => ({}) }));
vi.mock('@/envs/app', () => ({ appEnv: { enableQueueAgentRuntime: true } }));
vi.mock('@/libs/hatchet', () => ({ enqueueHatchetTask: enqueue }));
vi.mock('@/server/services/taskRunner/scheduleTick', () => ({ runScheduleTick: vi.fn() }));

const baseTask = (overrides: Record<string, unknown> = {}) => ({
  context: { scheduler: { scheduleStartedAt: '2026-05-01T00:00:00Z' } },
  createdByUserId: 'user-1',
  executionGeneration: 0,
  id: 'task-1',
  identifier: 'T-1',
  lastHeartbeatAt: null,
  schedulePattern: '0 9 * * *',
  scheduleTimezone: 'Asia/Shanghai',
  ...overrides,
});

describe('schedule dispatch planned identity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T03:00:00Z'));
    enqueue.mockReset().mockResolvedValue(undefined);
    request.mockReset().mockResolvedValue({ state: 'created', dispatch: {} });
    getScheduledTasks.mockReset().mockResolvedValue([baseTask()]);
  });
  afterEach(() => vi.useRealTimers());

  it('coalesces several missed days into one planned slot and reuses it after generation changes', async () => {
    await runScheduleDispatch();
    getScheduledTasks.mockResolvedValue([baseTask({ executionGeneration: 19 })]);
    vi.setSystemTime(new Date('2026-05-04T03:10:00Z'));
    await runScheduleDispatch();
    const tickToken = scheduleOccurrenceToken({
      taskId: 'task-1',
      pattern: '0 9 * * *',
      timezone: 'Asia/Shanghai',
      plannedAt: new Date('2026-05-04T01:00:00Z'),
    });
    expect(request).toHaveBeenCalledWith({
      taskId: 'task-1',
      trigger: 'schedule',
      idempotencyKey: `schedule:tick:${tickToken}`,
      expectedDefinitionVersionId: snapshotAutomationDefinition(baseTask() as unknown as TaskItem)
        .definitionVersionId,
      requestedBy: 'user-1',
      initiator: 'user-1',
      origin: 'external',
    });
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(enqueue.mock.invocationCallOrder[0]);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue.mock.calls[0][1]).toEqual({ taskId: 'task-1', userId: 'user-1', tickToken });
    expect(enqueue.mock.calls[1][1]).toEqual(enqueue.mock.calls[0][1]);
  });

  it('does not replay a covered plan or a slot from before enable', async () => {
    getScheduledTasks.mockResolvedValue([
      baseTask({ lastHeartbeatAt: new Date('2026-05-04T01:00:00Z') }),
      baseTask({ context: { scheduler: { scheduleStartedAt: '2026-05-04T02:00:00Z' } } }),
    ]);
    expect(await runScheduleDispatch()).toMatchObject({ due: 0, dispatched: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('does not mint or publish an occurrence for a dry-run sweep', async () => {
    expect(await runScheduleDispatch({ dryRun: true })).toMatchObject({ due: 1, dispatched: 0 });
    expect(request).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('coalesces later when the canonical single-task dispatch is busy', async () => {
    request.mockResolvedValue({ state: 'busy', active: {} });
    expect(await runScheduleDispatch()).toMatchObject({ due: 0, dispatched: 0 });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('reports persistence failures and does not publish an unbound event', async () => {
    request.mockRejectedValue(new Error('database unavailable'));
    expect(await runScheduleDispatch()).toMatchObject({ due: 0, dispatched: 0, success: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('retains the canonical occurrence and reports a failed queue publish', async () => {
    enqueue.mockRejectedValue(new Error('queue unavailable'));
    expect(await runScheduleDispatch()).toMatchObject({ due: 1, dispatched: 0, success: false });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps an invalid timezone from blocking other due tasks', async () => {
    getScheduledTasks.mockResolvedValue([baseTask({ scheduleTimezone: 'Not/AZone' }), baseTask()]);
    expect(await runScheduleDispatch()).toMatchObject({ due: 1, dispatched: 1 });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
