import { enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import type { GoalSchedulerImpl, ScheduleGoalAdvanceParams } from './type';

export class HatchetGoalScheduler implements GoalSchedulerImpl {
  async scheduleAdvance({
    delay = 0,
    goalId,
    trigger,
    userId,
    workspaceId,
  }: ScheduleGoalAdvanceParams): Promise<string> {
    return enqueueHatchetTask(
      HATCHET_TASK_NAMES.goalAdvance,
      { goalId, trigger, userId, workspaceId },
      { delayMs: delay * 1000 },
    );
  }
}
