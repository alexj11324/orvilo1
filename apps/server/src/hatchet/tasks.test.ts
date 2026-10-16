import { describe, expect, it, vi } from 'vitest';

import { HATCHET_TASK_NAMES } from '../services/hatchet/taskNames';
import { createCoreHatchetTasks } from './tasks';

describe('core Hatchet registration', () => {
  it('withdraws legacy Goal/Verify producers while retaining Issue scheduling and Slack', () => {
    const task = vi.fn((definition: { name: string }) => definition);
    const registered = createCoreHatchetTasks({ task } as never).map(({ name }) => name);

    for (const name of [
      HATCHET_TASK_NAMES.goalAdvance,
      HATCHET_TASK_NAMES.goalSweep,
      HATCHET_TASK_NAMES.verifySweep,
    ]) {
      expect(registered).not.toContain(name);
      expect(task.mock.calls.some(([definition]) => definition.name === name)).toBe(false);
    }
    for (const name of [
      HATCHET_TASK_NAMES.taskHeartbeat,
      HATCHET_TASK_NAMES.taskScheduleExecute,
      HATCHET_TASK_NAMES.taskScheduleDispatch,
      HATCHET_TASK_NAMES.taskWatchdog,
      HATCHET_TASK_NAMES.slackIntegrationEvent,
    ]) {
      expect(registered).toContain(name);
    }
  });
});
