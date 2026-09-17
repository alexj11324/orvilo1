import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { runTaskWatchdog } from '@/server/services/taskWatchdog';
import { sweepTaskCancellations } from '@/server/services/taskCancellation';

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
    const cancellationOutcomes = await sweepTaskCancellations({ db });
    const result = await runTaskWatchdog(db);
    const canceledDispatches = cancellationOutcomes.filter(
      (outcome) => outcome.outcome === 'canceled',
    ).length;
    const cancellationRetries = cancellationOutcomes.filter(
      (outcome) => outcome.outcome === 'retry',
    ).length;

    return c.json({
      canceledDispatches,
      cancellationRetries,
      ...result,
      success: true,
    });
  } catch (error) {
    console.error('[task/watchdog] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
