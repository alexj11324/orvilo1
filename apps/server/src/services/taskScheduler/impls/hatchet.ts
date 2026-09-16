import { cancelHatchetTask, enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import type { ScheduleNextTopicParams, TaskSchedulerImpl } from './type';

export class HatchetTaskScheduler implements TaskSchedulerImpl {
  async scheduleNextTopic({
    taskId,
    userId,
    delay = 0,
    tickToken,
  }: ScheduleNextTopicParams): Promise<string> {
    return enqueueHatchetTask(
      HATCHET_TASK_NAMES.taskHeartbeat,
      { taskId, tickToken, userId },
      { delayMs: delay * 1000 },
    );
  }

  async cancelScheduled(taskId: string): Promise<void> {
    await cancelHatchetTask(taskId);
  }
}
