import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { sweepMcpEventSubscriptions } from '@/server/services/mcpEvents/maintenance';
import { sweepMcpEventInbox } from '@/server/services/mcpEvents/runtime';
import { sweepTaskBacklogIntake } from '@/server/services/taskBacklogIntake';
import { sweepTaskCancellations } from '@/server/services/taskCancellation';
import { sweepTaskDispatchRecovery } from '@/server/services/taskDispatchRecovery';
import { sweepTaskDispatchResume } from '@/server/services/taskDispatchResume';
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
    // The resume sweep runs between recovery and cancellation: it re-drives
    // stranded requested/claimed rows and parked waiting rows under their
    // stored idempotency keys, and rows it cannot resume (unresumable trigger
    // or the attempt bound) land in the same cancellation pass.
    const resumeOutcomes = await sweepTaskDispatchResume({ db });
    const cancellationOutcomes = await sweepTaskCancellations({ db });
    const result = await runTaskWatchdog(db);
    // Intake last: cancellations/resume settle stale intents first, so a
    // project autoDispatch pull sees the freed capacity this pass created.
    const intakeOutcomes = await sweepTaskBacklogIntake({ db });
    // Event ingress has its own durable leases, but shares this maintenance
    // invocation and the core admission boundary with ordinary task dispatch.
    // A missing event migration must not stop cancellation/watchdog recovery.
    let eventInbox: unknown;
    let eventSubscriptions: unknown;
    try {
      eventSubscriptions = await sweepMcpEventSubscriptions(db);
    } catch {
      eventSubscriptions = { status: 'unavailable' };
      console.error('[task/watchdog] MCP event subscription maintenance unavailable');
    }
    try {
      eventInbox = await sweepMcpEventInbox(db);
    } catch {
      eventInbox = { status: 'unavailable' };
      console.error('[task/watchdog] MCP event inbox sweep unavailable');
    }
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
    const resumedDispatches = resumeOutcomes.filter(
      (outcome) => outcome.outcome === 'resumed',
    ).length;
    const resumeRetries = resumeOutcomes.filter((outcome) => outcome.outcome === 'retry').length;
    const stoppedDispatches = resumeOutcomes.filter(
      (outcome) => outcome.outcome === 'stopped',
    ).length;
    const intakeStarted = intakeOutcomes.filter((outcome) => outcome.outcome === 'started').length;
    const intakeWaiting = intakeOutcomes.filter((outcome) => outcome.outcome === 'waiting').length;

    return c.json({
      abandonedDispatches,
      eventInbox,
      eventSubscriptions,
      activeDispatches,
      canceledDispatches,
      driftFencedDispatches,
      intakeStarted,
      intakeWaiting,
      orphanedTasksParked,
      cancellationRetries,
      dispatchRecoveryRetries,
      resumeRetries,
      resumedDispatches,
      stoppedDispatches,
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
