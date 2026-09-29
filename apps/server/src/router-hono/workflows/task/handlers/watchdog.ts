import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { sweepTaskCancellations } from '@/server/services/taskCancellation';
import { sweepTaskDispatchRecovery } from '@/server/services/taskDispatchRecovery';
import { sweepPlanningTaskDispatchStarts } from '@/server/services/taskDispatchStart';
import { sweepTaskOwnershipInvariants } from '@/server/services/taskOwnership';
import { runTaskWatchdog } from '@/server/services/taskWatchdog';

/**
 * Cron-style watchdog. Scans all `running` tasks where
 * `lastHeartbeatAt + heartbeatTimeout < now()` and marks them `failed`,
 * leaving an urgent brief for the user.
 *
 * No per-user authentication: this is a global sweep registered as a Hatchet
 * cron task and invoked directly by the worker.
 */
export async function watchdog(c: Context) {
  try {
    const db = await getServerDB();
    const plannedStartOutcomes = await sweepPlanningTaskDispatchStarts({ db });
    const plannedStarts = plannedStartOutcomes.filter(
      (outcome) => outcome.outcome === 'started',
    ).length;
    const plannedStartRetries = plannedStartOutcomes.filter(
      (outcome) => outcome.outcome === 'retry',
    ).length;
    const plannedStartWaits = plannedStartOutcomes.filter(
      (outcome) => outcome.outcome === 'waiting',
    ).length;
    const dispatchRecoveryOutcomes = await sweepTaskDispatchRecovery({ db });
    const activeDispatches = dispatchRecoveryOutcomes.filter(
      (outcome) => outcome.outcome === 'active',
    ).length;
    const recoveredDispatches = dispatchRecoveryOutcomes.filter(
      (outcome) => outcome.outcome === 'settled',
    ).length;
    const dispatchRecoveryRetries = dispatchRecoveryOutcomes.filter(
      (outcome) => outcome.outcome === 'retry',
    ).length;
    // Ownership invariants run between recovery and cancellation: a drifted
    // dispatch fenced here is consumed by the same cancellation sweep pass.
    const ownershipOutcomes = await sweepTaskOwnershipInvariants({ db });
    const cancellationOutcomes = await sweepTaskCancellations({ db });
    const result = await runTaskWatchdog(db);
    const abandonedDispatches = cancellationOutcomes.filter(
      (outcome) => outcome.outcome === 'abandoned',
    ).length;
    const driftFencedDispatches = ownershipOutcomes.filter(
      (outcome) => outcome.outcome === 'drift_fenced',
    ).length;
    const orphanedTasksParked = ownershipOutcomes.filter(
      (outcome) => outcome.outcome === 'orphan_parked',
    ).length;
    const canceledDispatches = cancellationOutcomes.filter(
      (outcome) => outcome.outcome === 'canceled',
    ).length;
    const cancellationRetries = cancellationOutcomes.filter(
      (outcome) => outcome.outcome === 'retry',
    ).length;

    return c.json({
      abandonedDispatches,
      activeDispatches,
      canceledDispatches,
      driftFencedDispatches,
      orphanedTasksParked,
      cancellationRetries,
      dispatchRecoveryRetries,
      ...result,
      plannedStartRetries,
      plannedStarts,
      plannedStartWaits,
      recoveredDispatches,
      success: true,
    });
  } catch (error) {
    console.error('[task/watchdog] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
