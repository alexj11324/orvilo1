import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { createMcpEventReceiver } from '@/server/services/mcpEvents/runtime';

/** Preserve the raw stream; the receiver bounds bytes and commits before ACK. */
export async function mcpEventsWebhook(c: Context): Promise<Response> {
  const token = c.req.param('callbackToken');
  if (!token) return c.json({ code: 'unknown_callback' }, 404);
  try {
    const db = await getServerDB();
    return await createMcpEventReceiver(db).receive(c.req.raw, token);
  } catch {
    // Do not log callback tokens, raw payloads, signing keys or database errors.
    return c.json({ code: 'receiver_unavailable' }, 503);
  }
}
