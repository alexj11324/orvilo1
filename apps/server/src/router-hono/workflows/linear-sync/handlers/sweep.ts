import debug from 'debug';
import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import {
  discoverLinearSyncSweepInstallations,
  LINEAR_SYNC_SWEEP_DEFAULT_MAX_INSTALLATIONS,
  LINEAR_SYNC_SWEEP_DEFAULT_SCHEDULE_LIMIT,
  LINEAR_SYNC_SWEEP_DEFAULT_WORKFLOW_LIMIT,
  LINEAR_SYNC_SWEEP_MAX_INSTALLATIONS,
  LINEAR_SYNC_SWEEP_MAX_SCHEDULE_LIMIT,
  LINEAR_SYNC_SWEEP_MAX_WORKFLOW_LIMIT,
  sweepLinearSyncInstallations,
} from '@/server/services/linearSync/sweeper';
import { LinearSyncWorkflow } from '@/server/workflows/linearSync';

const log = debug('lobe-server:workflows:linear-sync:sweep');

export interface LinearSyncSweepPayload {
  dryRun?: boolean;
  limit?: number;
  maxInstallations?: number;
  scheduleLimit?: number;
}

const bounded = (value: unknown, fallback: number, maximum: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value)));
};

/**
 * Cron-style safety net for Linear's durable queues. The webhook/import fast
 * paths publish the installation workflow, while this route recovers rows
 * whose publish was lost. It only publishes installation-level work; the
 * leased workers select the actual rows.
 */
export const sweep = async (c: Context) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as LinearSyncSweepPayload;
    const dryRun = body?.dryRun === true;
    const workflowLimit = bounded(
      body?.limit,
      LINEAR_SYNC_SWEEP_DEFAULT_WORKFLOW_LIMIT,
      LINEAR_SYNC_SWEEP_MAX_WORKFLOW_LIMIT,
    );
    const maxInstallations = bounded(
      body?.maxInstallations,
      LINEAR_SYNC_SWEEP_DEFAULT_MAX_INSTALLATIONS,
      LINEAR_SYNC_SWEEP_MAX_INSTALLATIONS,
    );
    const scheduleLimit = bounded(
      body?.scheduleLimit,
      LINEAR_SYNC_SWEEP_DEFAULT_SCHEDULE_LIMIT,
      LINEAR_SYNC_SWEEP_MAX_SCHEDULE_LIMIT,
    );
    const db = await getServerDB();
    const discovery = await discoverLinearSyncSweepInstallations(db, { maxInstallations });
    const outcome = await sweepLinearSyncInstallations({
      dryRun,
      installations: discovery.installations,
      maxScheduledInstallations: scheduleLimit,
      planningBacklog: discovery.planningBacklog,
      triggerInstallation: (input) => LinearSyncWorkflow.triggerInstallation(input),
      workflowLimit,
    });

    log(
      'scan: installations=%d active=%d actionable=%d scheduled=%d failed=%d inbox=%d outbox=%d planning=%d oldest=%s dryRun=%s',
      outcome.scannedInstallations,
      outcome.activeInstallations,
      outcome.actionableInstallations,
      outcome.scheduled,
      outcome.failed,
      outcome.inboxBacklog,
      outcome.outboxBacklog,
      outcome.planningBacklog,
      outcome.oldestBacklogAt ?? 'none',
      outcome.dryRun,
    );

    return c.json({ ...outcome, success: true });
  } catch (error) {
    console.error('[linear-sync/sweep] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
};
