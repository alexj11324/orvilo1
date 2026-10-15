// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { runGoalSweep } from '@/server/router-hono/workflows/goal/handlers/sweep';

import { scheduleGoalAdvance } from '../index';
import { HatchetGoalScheduler } from './hatchet';
import { LocalGoalScheduler } from './local';

const mocks = vi.hoisted(() => ({ enqueueHatchetTask: vi.fn(), getServerDB: vi.fn() }));
vi.mock('@/libs/hatchet', () => ({ enqueueHatchetTask: mocks.enqueueHatchetTask }));
vi.mock('@/database/server', () => ({ getServerDB: mocks.getServerDB }));

describe('retired Goal scheduling', () => {
  it('does not publish, scan or set a local timer for persisted callbacks', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const params = { goalId: 'old-goal', userId: 'owner' };
    await scheduleGoalAdvance(params);
    expect(await new HatchetGoalScheduler().scheduleAdvance(params)).toBe('goal-retired');
    expect(await new LocalGoalScheduler().scheduleAdvance(params)).toBe('goal-retired');
    expect(await runGoalSweep()).toMatchObject({ advanced: 0, skipped: 'goal_retired' });
    expect(mocks.enqueueHatchetTask).not.toHaveBeenCalled();
    expect(mocks.getServerDB).not.toHaveBeenCalled();
    expect(timer).not.toHaveBeenCalled();
    timer.mockRestore();
  });
});
