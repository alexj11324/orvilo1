import type { OrchestrationWorkflowAdvanceTrigger } from '@orvilo/agent-tracing';
import type {
  OrchestrationWorkflowTickOutcome,
  OrchestrationWorkflowTickResult,
} from '@orvilo/types';
import debug from 'debug';

import { getServerDB } from '@/database/server';

import { OrchestrationWorkflowService } from './index';
import {
  OrchestrationWorkflowAdvanceRecorder,
  TERMINAL_ORCHESTRATION_WORKFLOW_STATUSES,
} from './orchestrationWorkflowTraceRecorder';

const log = debug('orvilo-server:orchestration-workflow-advance');

/**
 * Outcomes the coordinator cannot get past by ticking again.
 *
 * `waiting_external` is one of them here, and that is the whole point of the
 * event-driven design: it means a graph Task is now executing, so the next move
 * belongs to that task's completion, not to a poll loop holding a worker open.
 */
const STOP_OUTCOMES = new Set<OrchestrationWorkflowTickOutcome>([
  'achieved',
  'failed',
  'no_progress',
  'waiting_external',
  'waiting_human',
]);

/**
 * Safety limit for one advance. Dispatching a Task takes two ticks and an
 * advance now fills every free concurrency slot, so a healthy run is a
 * handful; anything near this is a loop that is not converging, and the sweep
 * will come back to it.
 */
export const MAX_TICKS_PER_ADVANCE = 20;

export interface AdvanceOrchestrationWorkflowParams {
  orchestrationWorkflowId: string;
  /** What caused this advance. Recorded on the trajectory so a run can be sliced by source. */
  trigger?: OrchestrationWorkflowAdvanceTrigger;
  userId: string;
  workspaceId?: string;
}

export interface AdvanceOrchestrationWorkflowOutcome {
  orchestrationWorkflowId: string;
  result: OrchestrationWorkflowTickResult;
  ticks: number;
}

/**
 * Advance a orchestration workflow until it is waiting on something that is not another tick.
 *
 * This is the server-side driver: a orchestration workflow moves because something happened to
 * it, not because a client is holding a loop open. Runs as the orchestration workflow's own
 * owner, so it sees exactly what that user's coordinator would see.
 */
export const advanceOrchestrationWorkflow = async ({
  orchestrationWorkflowId,
  trigger = 'unknown',
  userId,
  workspaceId,
}: AdvanceOrchestrationWorkflowParams): Promise<AdvanceOrchestrationWorkflowOutcome> => {
  const db = await getServerDB();
  const service = new OrchestrationWorkflowService(db, userId, workspaceId);
  const recorder = new OrchestrationWorkflowAdvanceRecorder(db, orchestrationWorkflowId, trigger);

  let result: OrchestrationWorkflowTickResult | undefined;
  try {
    for (let ticks = 1; ticks <= MAX_TICKS_PER_ADVANCE; ticks++) {
      result = await service.tick(orchestrationWorkflowId, { onDecision: recorder.onDecision });
      log(
        'orchestration workflow %s tick %d → %s (%s)',
        orchestrationWorkflowId,
        ticks,
        result.outcome,
        result.message,
      );
      if (STOP_OUTCOMES.has(result.outcome)) {
        await settleTrace(recorder, service, orchestrationWorkflowId);
        return { orchestrationWorkflowId, result, ticks };
      }
    }
  } catch (error) {
    // Record what the advance managed to do before it threw. A trajectory that
    // stops mid-advance with the failure attached is the whole point of keeping
    // one — losing it is exactly the blind spot this replaces.
    await recorder.flush(error);
    throw error;
  }

  log('orchestration workflow %s hit the per-advance tick limit', orchestrationWorkflowId);
  await settleTrace(recorder, service, orchestrationWorkflowId);
  return { orchestrationWorkflowId, result: result!, ticks: MAX_TICKS_PER_ADVANCE };
};

/**
 * Write the advance, then close the trajectory if the orchestration workflow itself is done.
 *
 * The status is re-read rather than inferred from the outcome: `failed` is
 * reported both by a orchestration workflow that is genuinely over and by a tick that could not
 * find a responsible task, and only the first should finalize.
 */
const settleTrace = async (
  recorder: OrchestrationWorkflowAdvanceRecorder,
  service: OrchestrationWorkflowService,
  orchestrationWorkflowId: string,
): Promise<void> => {
  await recorder.flush();
  if (!recorder.enabled) return;

  const status = await service.status(orchestrationWorkflowId).catch(() => undefined);
  if (status && TERMINAL_ORCHESTRATION_WORKFLOW_STATUSES.has(status))
    await recorder.finalize(status);
};
