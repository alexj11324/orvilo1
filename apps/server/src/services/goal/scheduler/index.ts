import type { ScheduleGoalAdvanceParams } from './impls';

/** Historical completion callbacks must not enqueue the retired coordinator. */
export const scheduleGoalAdvance = async (_params: ScheduleGoalAdvanceParams): Promise<void> => {
  return;
};

export type { GoalSchedulerImpl, ScheduleGoalAdvanceParams } from './impls';
export { createGoalSchedulerModule, HatchetGoalScheduler } from './impls';
