import debug from 'debug';
import type { Context } from 'hono';

import { OrchestrationWorkflowModel } from '@/database/models/orchestrationWorkflow';
import { getServerDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { enqueueHatchetTask } from '@/libs/hatchet';
import { HATCHET_TASK_NAMES } from '@/server/services/hatchet/taskNames';
import { advanceOrchestrationWorkflow } from '@/server/services/orchestrationWorkflow/advanceOrchestrationWorkflow';

const log = debug('orvilo-server:workflows:orchestrationWorkflow:sweep');

/**
 * How long a Work may hold its operation lease before the sweep treats the orchestration workflow
 * as stalled. Above the coordinator's own claim TTL so a healthy run is never
 * swept while it is between heartbeats.
 */
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;

export interface OrchestrationWorkflowSweepPayload {
  /** Only report what would be advanced. */
  dryRun?: boolean;
  limit?: number;
  /** Override the stale window, in milliseconds. */
  staleAfterMs?: number;
}

/**
 * Cron-style safety net for orchestration workflow advancement.
 *
 * The fast path is event-driven — creating a orchestration workflow, resolving a gate, or a Work
 * Task settling all queue an advance. This sweep exists because that path can
 * be missed: a queue message can be dropped, a runner can die between
 * dispatching a Work and writing its outcome, and a Work can outlive its
 * operation lease with nobody left to reclaim it. Without it, one lost message
 * strands a long-horizon orchestration workflow forever.
 *
 * Registered as a Hatchet cron task. Global scan, no per-user auth; the worker
 * invokes this handler directly.
 */
export async function sweep(c: Context) {
  try {
    const body = (await c.req.json().catch(() => ({}))) as OrchestrationWorkflowSweepPayload;
    return c.json(await runOrchestrationWorkflowSweep(body));
  } catch (error) {
    console.error('[orchestration workflow/sweep] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}

export const runOrchestrationWorkflowSweep = async ({
  dryRun = false,
  limit = 200,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
}: OrchestrationWorkflowSweepPayload = {}) => {
  const db = await getServerDB();
  const stalled = await OrchestrationWorkflowModel.listStalled(db, {
    limit,
    staleBefore: new Date(Date.now() - staleAfterMs),
  });

  log('scan: stalled=%d dryRun=%s', stalled.length, dryRun);

  if (dryRun || stalled.length === 0) {
    return { advanced: 0, dryRun, stalled: stalled.length, success: true };
  }

  const advanced = await fanout(
    stalled.map((orchestrationWorkflow) => ({
      orchestrationWorkflowId: orchestrationWorkflow.id,
      trigger: 'sweep' as const,
      userId: orchestrationWorkflow.userId,
      workspaceId: orchestrationWorkflow.workspaceId ?? undefined,
    })),
  );

  return { advanced, stalled: stalled.length, success: true };
};

interface StalledOrchestrationWorkflow {
  orchestrationWorkflowId: string;
  trigger: 'sweep';
  userId: string;
  workspaceId?: string;
}

/**
 * Hand each orchestration workflow off individually so one that throws cannot take the sweep
 * down with it, and so each gets its own retry budget in queue mode.
 */
const fanout = async (orchestrationWorkflows: StalledOrchestrationWorkflow[]): Promise<number> => {
  const results = appEnv.enableQueueAgentRuntime
    ? await publishAll(orchestrationWorkflows)
    : await Promise.allSettled(
        orchestrationWorkflows.map((orchestrationWorkflow) =>
          advanceOrchestrationWorkflow(orchestrationWorkflow),
        ),
      );

  let advanced = 0;
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') advanced += 1;
    else
      console.error(
        '[orchestration workflow/sweep] advance failed orchestration workflow=%s: %O',
        orchestrationWorkflows[index].orchestrationWorkflowId,
        result.reason,
      );
  }
  return advanced;
};

const publishAll = async (orchestrationWorkflows: StalledOrchestrationWorkflow[]) => {
  return Promise.allSettled(
    orchestrationWorkflows.map((input) =>
      enqueueHatchetTask(HATCHET_TASK_NAMES.orchestrationWorkflowAdvance, input),
    ),
  );
};
