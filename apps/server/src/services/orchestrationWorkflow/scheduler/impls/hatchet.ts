import { enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';

import type {
  OrchestrationWorkflowSchedulerImpl,
  ScheduleOrchestrationWorkflowAdvanceParams,
} from './type';

export class HatchetOrchestrationWorkflowScheduler implements OrchestrationWorkflowSchedulerImpl {
  async scheduleAdvance({
    delay = 0,
    orchestrationWorkflowId,
    trigger,
    userId,
    workspaceId,
  }: ScheduleOrchestrationWorkflowAdvanceParams): Promise<string> {
    return enqueueHatchetTask(
      HATCHET_TASK_NAMES.orchestrationWorkflowAdvance,
      { orchestrationWorkflowId, trigger, userId, workspaceId },
      { delayMs: delay * 1000 },
    );
  }
}
