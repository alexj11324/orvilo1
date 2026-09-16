import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { runTaskWatchdog } from '@/server/services/taskWatchdog';

/**
 * Cron-style watchdog. Scans all `running` tasks where
 * `lastHeartbeatAt + heartbeatTimeout < now()` and marks them `failed`,
 * leaving an urgent brief for the user.
 *
 * No per-user authentication: this is a global sweep registered as a QStash
 * Schedule (cron). Signature verification is handled by the `qstashAuth`
 * middleware mounted on the route.
 */
export async function watchdog(c: Context) {
  try {
    const db = await getServerDB();
    return c.json(await runTaskWatchdog(db));
  } catch (error) {
    console.error('[task/watchdog] Error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
  }
}
