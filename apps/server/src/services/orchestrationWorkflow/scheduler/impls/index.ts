import { appEnv } from '@/envs/app';

import { HatchetOrchestrationWorkflowScheduler } from './hatchet';
import { LocalOrchestrationWorkflowScheduler } from './local';
import type { OrchestrationWorkflowSchedulerImpl } from './type';

let cached: OrchestrationWorkflowSchedulerImpl | null = null;

/**
 * The singleton orchestration workflow scheduler.
 *
 * - `AGENT_RUNTIME_MODE=queue`: Hatchet (production)
 * - otherwise: in-process timers (dev / desktop)
 *
 * Singleton because the local implementation holds pending timers; a
 * per-request instance would orphan them.
 */
export const startOrchestrationWorkflowSchedulerModule = (): OrchestrationWorkflowSchedulerImpl => {
  if (cached) return cached;

  if (appEnv.enableQueueAgentRuntime) {
    cached = new HatchetOrchestrationWorkflowScheduler();
    return cached;
  }

  cached = new LocalOrchestrationWorkflowScheduler();
  return cached;
};

export { HatchetOrchestrationWorkflowScheduler } from './hatchet';
export { LocalOrchestrationWorkflowScheduler } from './local';
export type {
  OrchestrationWorkflowSchedulerImpl,
  ScheduleOrchestrationWorkflowAdvanceParams,
} from './type';
