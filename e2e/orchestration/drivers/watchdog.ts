/**
 * Orchestration-scenario harness driver: invokes the real watchdog() workflow
 * handler exactly like the Hatchet cron does via runInternalHandler
 * (apps/server/src/hatchet/tasks.ts) — a stub hono Context whose c.json builds
 * a Response. Runs all sweeps against the DB in DATABASE_URL.
 */
import type { Context } from 'hono';

import { watchdog } from '../../../apps/server/src/router-hono/workflows/task/handlers/watchdog';

const response = await watchdog({
  json: (body: unknown, status = 200, headers?: HeadersInit) =>
    Response.json(body, { headers, status }),
  req: { json: async () => ({}) },
} as unknown as Context);

const body = await response.json();
console.log('===WATCHDOG_STATUS===' + response.status);
console.log('===WATCHDOG_JSON===' + JSON.stringify(body));
process.exit(0);
