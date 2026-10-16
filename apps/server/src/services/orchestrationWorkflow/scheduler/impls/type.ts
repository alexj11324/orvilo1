import type { OrchestrationWorkflowAdvanceTrigger } from '@orvilo/agent-tracing';

export interface ScheduleOrchestrationWorkflowAdvanceParams {
  /** Seconds to wait before advancing. Defaults to 0 (as soon as possible). */
  delay?: number;
  orchestrationWorkflowId: string;
  /** What made this orchestration workflow advanceable. Survives the queue hop onto the trajectory. */
  trigger?: OrchestrationWorkflowAdvanceTrigger;
  userId: string;
  workspaceId?: string;
}

export interface OrchestrationWorkflowSchedulerImpl {
  scheduleAdvance: (params: ScheduleOrchestrationWorkflowAdvanceParams) => Promise<string>;
}
