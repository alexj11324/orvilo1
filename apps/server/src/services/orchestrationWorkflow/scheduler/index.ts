import debug from 'debug';

import {
  type ScheduleOrchestrationWorkflowAdvanceParams,
  startOrchestrationWorkflowSchedulerModule,
} from './impls';

const log = debug('orchestration-workflow-scheduler');

/**
 * Ask the coordinator to advance a orchestration workflow, without waiting for it.
 *
 * Every caller is a place where a orchestration workflow *might* now be able to move — it was
 * created, a gate was resolved, a budget was raised, a graph Task settled. None
 * of them should fail because the advance could not be queued, and none of them
 * should block on it: the handler re-reads the orchestration workflow, and the sweep picks up
 * anything a lost message would have stranded.
 */
export const scheduleOrchestrationWorkflowAdvance = async (
  params: ScheduleOrchestrationWorkflowAdvanceParams,
): Promise<void> => {
  try {
    await startOrchestrationWorkflowSchedulerModule().scheduleAdvance(params);
    log('queued advance for orchestration workflow %s', params.orchestrationWorkflowId);
  } catch (error) {
    // Loud on purpose: this is the only thing that makes a orchestration workflow move on its
    // own, so a broken dispatch must be visible in the logs rather than left to
    // be inferred from orchestration workflows that quietly stop progressing. The sweep still
    // covers the orchestration workflow, which is why this stays non-fatal for the caller.
    console.error(
      '[orchestration workflow/scheduler] failed to queue advance for %s:',
      params.orchestrationWorkflowId,
      error,
    );
  }
};

export type {
  OrchestrationWorkflowSchedulerImpl,
  ScheduleOrchestrationWorkflowAdvanceParams,
} from './impls';
export {
  HatchetOrchestrationWorkflowScheduler,
  startOrchestrationWorkflowSchedulerModule,
} from './impls';
