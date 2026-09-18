// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import { HatchetGoalScheduler } from './hatchet';

const mocks = vi.hoisted(() => ({ enqueueHatchetTask: vi.fn() }));

vi.mock('@/libs/hatchet', () => mocks);

describe('HatchetGoalScheduler', () => {
  const scheduler = new HatchetGoalScheduler();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schedules an owner-scoped goal advance', async () => {
    mocks.enqueueHatchetTask.mockResolvedValue('hatchet-run:run-1');

    const id = await scheduler.scheduleAdvance({
      delay: 5,
      goalId: 'goal-1',
      trigger: 'create',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(id).toBe('hatchet-run:run-1');
    expect(mocks.enqueueHatchetTask).toHaveBeenCalledWith(
      HATCHET_TASK_NAMES.goalAdvance,
      {
        goalId: 'goal-1',
        trigger: 'create',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      },
      { delayMs: 5000 },
    );
  });
});
