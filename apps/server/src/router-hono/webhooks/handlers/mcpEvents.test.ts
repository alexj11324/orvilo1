// @vitest-environment node
import { createHmac } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpEventsDatabase } from '@/server/services/mcpEvents/database';
import type { McpEventBinding } from '@/server/services/mcpEvents/deliveryTypes';
import {
  MCP_EVENT_BINDING_SCHEMA_SQL,
  MCP_EVENT_INBOX_SCHEMA_SQL,
  SqlMcpEventBindingRepository,
} from '@/server/services/mcpEvents/inbox';
import { sweepMcpEventInbox } from '@/server/services/mcpEvents/runtime';

import { mcpEventsWebhook } from './mcpEvents';

const connection = vi.hoisted(() => ({ db: undefined as McpEventsDatabase | undefined }));
vi.mock('@/database/server', () => ({
  getServerDB: async () => {
    if (!connection.db) throw new Error('database unavailable');
    return connection.db;
  },
}));

describe('MCP Events Hono raw callback route', () => {
  const secret = Buffer.alloc(32, 11);
  const app = new Hono().post('/api/webhooks/mcp-events/:callbackToken', mcpEventsWebhook);
  let database: PGlite;
  const request = (raw: string, tamper = false) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', secret)
      .update(`event-1.${timestamp}.`)
      .update(raw)
      .digest('base64');
    return app.request('/api/webhooks/mcp-events/token-1', {
      body: raw + (tamper ? ' ' : ''),
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'event-1',
        'webhook-signature': `v1,${signature}`,
        'webhook-timestamp': timestamp,
        'x-mcp-subscription-id': 'remote-1',
      },
      method: 'POST',
    });
  };
  const occurrence = () =>
    JSON.stringify(
      {
        data: { text: 'route acceptance' },
        eventId: 'event-1',
        name: 'message',
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    );

  beforeEach(async () => {
    database = new PGlite();
    await database.exec(MCP_EVENT_BINDING_SCHEMA_SQL + MCP_EVENT_INBOX_SCHEMA_SQL);
    connection.db = drizzle(database);
    const binding: McpEventBinding = {
      callbackToken: 'token-1',
      callbackUrl: 'https://receiver.example/api/webhooks/mcp-events/token-1',
      connectorId: 'connector-1',
      cursor: null,
      eventArguments: {},
      eventName: 'message',
      expiresAt: null,
      id: 'binding-1',
      payloadSchema: { type: 'object' },
      remoteSubscriptionId: null,
      revision: 0,
      schemaId: 'message-v1',
      signingKeys: [{ secret: `whsec_${secret.toString('base64')}` }],
      state: 'pending',
      tenantId: 'tenant-1',
      truncated: false,
    };
    const bindings = new SqlMcpEventBindingRepository(database);
    await bindings.createPending(binding);
    await bindings.verifyPending(
      binding.callbackToken,
      'remote-1',
      'challenge-1',
      'fresh',
      Date.now(),
    );
    await bindings.update(binding, binding.id, 'pending', { state: 'active' }, 0);
  });
  afterEach(async () => {
    connection.db = undefined;
    await database.close();
  });

  it('persists exact signed bytes before returning accepted and deduplicates redelivery', async () => {
    const raw = occurrence();
    const response = await request(raw);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ code: 'accepted' });
    const rows = await database.query<{ delivery: { rawBodyBase64: string } }>(
      'SELECT delivery FROM mcp_event_inbox',
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].delivery.rawBodyBase64).toBe(Buffer.from(raw).toString('base64'));
    expect(await (await request(raw)).json()).toEqual({ code: 'duplicate' });
  });

  it('rejects byte tampering without persisting and does not ACK unavailable storage', async () => {
    expect((await request(occurrence(), true)).status).toBe(401);
    expect((await database.query('SELECT id FROM mcp_event_inbox')).rows).toEqual([]);
    connection.db = undefined;
    expect((await request(occurrence())).status).toBe(503);
  });

  it('preserves accepted work and retry budget until core admission is configured', async () => {
    expect((await request(occurrence())).status).toBe(202);
    expect(await sweepMcpEventInbox(drizzle(database))).toMatchObject({
      claimed: 0,
      reason: 'runtime-unavailable',
      status: 'waiting',
    });
    expect((await database.query('SELECT status, attempts FROM mcp_event_inbox')).rows).toEqual([
      { attempts: 0, status: 'pending' },
    ]);
  });
});
