import type { GoalSchedulerImpl, ScheduleGoalAdvanceParams } from './type';

export class LocalGoalScheduler implements GoalSchedulerImpl {
  async scheduleAdvance(_params: ScheduleGoalAdvanceParams): Promise<string> {
    return 'goal-retired';
  }
}
