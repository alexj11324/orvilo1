// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import { HatchetTaskScheduler } from './hatchet';

const mocks = vi.hoisted(() => ({
  cancelHatchetTask: vi.fn(),
  enqueueHatchetTask: vi.fn(),
}));

vi.mock('@/libs/hatchet', () => mocks);

describe('HatchetTaskScheduler', () => {
  const scheduler = new HatchetTaskScheduler();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules the heartbeat task with a millisecond delay', async () => {
    mocks.enqueueHatchetTask.mockResolvedValue('hatchet-schedule:schedule-1');

    const id = await scheduler.scheduleNextTopic({
      delay: 60,
      taskId: 'task-1',
      tickToken: 'generation-1',
      userId: 'user-1',
    });

    expect(id).toBe('hatchet-schedule:schedule-1');
    expect(mocks.enqueueHatchetTask).toHaveBeenCalledWith(
      HATCHET_TASK_NAMES.taskHeartbeat,
      { taskId: 'task-1', tickToken: 'generation-1', userId: 'user-1' },
      { delayMs: 60_000 },
    );
  });

  it('cancels the persisted Hatchet run or schedule', async () => {
    await scheduler.cancelScheduled('hatchet-schedule:schedule-1');

    expect(mocks.cancelHatchetTask).toHaveBeenCalledWith('hatchet-schedule:schedule-1');
  });
});
