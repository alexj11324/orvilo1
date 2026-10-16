import type { OrchestrationWorkflowAdvanceTrigger } from '@orvilo/agent-tracing';
import debug from 'debug';
import type { Context } from 'hono';

import { advanceOrchestrationWorkflow } from '@/server/services/orchestrationWorkflow/advanceOrchestrationWorkflow';

const log = debug('orvilo-server:workflows:orchestrationWorkflow:advance');

export interface OrchestrationWorkflowAdvancePayload {
  orchestrationWorkflowId?: string;
  trigger?: OrchestrationWorkflowAdvanceTrigger;
  userId?: string;
  workspaceId?: string;
}

/**
 * Advance one orchestration workflow. Queued whenever something may have unblocked it — it was
 * created, a decision gate was resolved, a budget was raised, or one of its
 * Work Tasks settled.
 *
 * The Hatchet task carries the orchestration workflow owner and the handler re-reads the orchestration workflow, so
 * a delivery that lands after the user paused it, or after it finished, is a
 * no-op.
 */
export async function advance(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as OrchestrationWorkflowAdvancePayload;
    const { orchestrationWorkflowId, trigger, userId, workspaceId } = body ?? {};

    if (!orchestrationWorkflowId || !userId) {
      return c.json(
        { error: 'orchestrationWorkflowId and userId are required', success: false },
        400,
      );
    }

    const outcome = await advanceOrchestrationWorkflow({
      orchestrationWorkflowId,
      trigger,
      userId,
      workspaceId,
    });
    log(
      'orchestration workflow %s advanced in %d tick(s) → %s',
      orchestrationWorkflowId,
      outcome.ticks,
      outcome.result.outcome,
    );

    return c.json({
      orchestrationWorkflowId,
      message: outcome.result.message,
      outcome: outcome.result.outcome,
      success: true,
      ticks: outcome.ticks,
    });
  } catch (error) {
    console.error('[orchestration workflow/advance] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
