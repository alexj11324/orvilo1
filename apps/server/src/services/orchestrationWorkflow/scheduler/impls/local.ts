import debug from 'debug';

import type {
  OrchestrationWorkflowSchedulerImpl,
  ScheduleOrchestrationWorkflowAdvanceParams,
} from './type';

const log = debug('orchestration-workflow-scheduler:local');

/**
 * Dev / desktop scheduler: a `setTimeout` in this process instead of a queue
 * message. It calls the same runner the HTTP handler calls, so local runs
 * exercise the real advance path rather than a stub.
 */
export class LocalOrchestrationWorkflowScheduler implements OrchestrationWorkflowSchedulerImpl {
  private pending = new Map<string, NodeJS.Timeout>();

  async scheduleAdvance(params: ScheduleOrchestrationWorkflowAdvanceParams): Promise<string> {
    const { delay = 0, orchestrationWorkflowId, trigger, userId, workspaceId } = params;
    const scheduleId = `local-orchestration-workflow-${orchestrationWorkflowId}-${Date.now()}`;

    log(
      'scheduling advance for orchestration workflow %s (delay: %ds)',
      orchestrationWorkflowId,
      delay,
    );
    const timer = setTimeout(async () => {
      this.pending.delete(scheduleId);
      try {
        const { advanceOrchestrationWorkflow } = await import('../../advanceOrchestrationWorkflow');
        await advanceOrchestrationWorkflow({
          orchestrationWorkflowId,
          trigger,
          userId,
          workspaceId,
        });
      } catch (error) {
        // Never surface: an advance is best-effort, and the sweep retries.
        log('advance failed for orchestration workflow %s: %O', orchestrationWorkflowId, error);
      }
    }, delay * 1000);

    this.pending.set(scheduleId, timer);
    return scheduleId;
  }
}
