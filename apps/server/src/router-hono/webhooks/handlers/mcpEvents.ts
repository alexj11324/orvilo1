import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import {
  createMcpEventReceiver,
  scheduleMcpEventInboxSweep,
} from '@/server/services/mcpEvents/runtime';

/** Preserve the raw stream; the receiver bounds bytes and commits before ACK. */
export async function mcpEventsWebhook(c: Context): Promise<Response> {
  const token = c.req.param('callbackToken');
  if (!token) return c.json({ code: 'unknown_callback' }, 404);
  try {
    const db = await getServerDB();
    const response = await createMcpEventReceiver(db).receive(c.req.raw, token);
    if (response.status === 202) {
      try {
        await scheduleMcpEventInboxSweep();
      } catch {
        // The committed inbox remains recoverable by the independent consumer
        // cron and watchdog. A 202 acknowledges receipt, never agent success.
        console.error('[mcp-events] Inbox wake-up unavailable; receipt remains queued');
      }
    }
    return response;
  } catch {
    // Do not log callback tokens, raw payloads, signing keys or database errors.
    return c.json({ code: 'receiver_unavailable' }, 503);
  }
}
