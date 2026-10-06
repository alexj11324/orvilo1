import type { Context } from 'hono';

import { getServerDB } from '@/database/server';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { createMcpEventsSql } from '@/server/services/mcpEvents/database';
import { GitHubEventReceiver } from '@/server/services/mcpEvents/githubReceiver';
import { SqlMcpEventBindingRepository, SqlMcpEventInbox } from '@/server/services/mcpEvents/inbox';
import { scheduleMcpEventInboxSweep } from '@/server/services/mcpEvents/runtime';

export async function githubEventsWebhook(c: Context): Promise<Response> {
  const token = c.req.param('callbackToken');
  if (!token) return c.json({ code: 'unknown_callback' }, 404);
  try {
    const database = createMcpEventsSql(await getServerDB());
    const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();
    const receiver = new GitHubEventReceiver({
      bindings: new SqlMcpEventBindingRepository(database),
      decrypt: (ciphertext) => gateKeeper.decrypt(ciphertext),
      inbox: new SqlMcpEventInbox(database),
    });
    const response = await receiver.receive(c.req.raw, token);
    const code = (await response.clone().json()).code;
    if (
      (response.status === 200 && code === 'verified') ||
      (response.status === 202 && ['accepted', 'duplicate'].includes(code))
    ) {
      try {
        await scheduleMcpEventInboxSweep();
      } catch {
        console.error('[github-events] Inbox wake-up unavailable');
      }
    }
    return response;
  } catch {
    return c.json({ code: 'receiver_unavailable' }, 503);
  }
}
