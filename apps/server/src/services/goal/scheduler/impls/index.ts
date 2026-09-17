import { appEnv } from '@/envs/app';

import { HatchetGoalScheduler } from './hatchet';
import { LocalGoalScheduler } from './local';
import type { GoalSchedulerImpl } from './type';

let cached: GoalSchedulerImpl | null = null;

/**
 * The singleton goal scheduler.
 *
 * - `AGENT_RUNTIME_MODE=queue`: Hatchet (production)
 * - otherwise: in-process timers (dev / desktop)
 *
 * Singleton because the local implementation holds pending timers; a
 * per-request instance would orphan them.
 */
export const createGoalSchedulerModule = (): GoalSchedulerImpl => {
  if (cached) return cached;

  if (appEnv.enableQueueAgentRuntime) {
    cached = new HatchetGoalScheduler();
    return cached;
  }

  cached = new LocalGoalScheduler();
  return cached;
};

export { HatchetGoalScheduler } from './hatchet';
export { LocalGoalScheduler } from './local';
export type { GoalSchedulerImpl, ScheduleGoalAdvanceParams } from './type';
