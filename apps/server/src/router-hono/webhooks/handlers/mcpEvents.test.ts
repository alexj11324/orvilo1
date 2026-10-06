// @vitest-environment node
import { createHmac } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';
import type { McpEventsDatabase } from '@/server/services/mcpEvents/database';
import type { McpEventBinding } from '@/server/services/mcpEvents/deliveryTypes';
import {
  MCP_EVENT_BINDING_SCHEMA_SQL,
  MCP_EVENT_INBOX_SCHEMA_SQL,
  SqlMcpEventBindingRepository,
} from '@/server/services/mcpEvents/inbox';
import { sweepMcpEventInbox } from '@/server/services/mcpEvents/runtime';
import { MCP_EVENT_WORK_SCHEMA_SQL } from '@/server/services/mcpEvents/workerRepository';

import { mcpEventsWebhook } from './mcpEvents';

const connection = vi.hoisted(() => ({ db: undefined as McpEventsDatabase | undefined }));
const enqueue = vi.hoisted(() => vi.fn().mockResolvedValue('queued'));
vi.mock('@/envs/app', () => ({ appEnv: { enableQueueAgentRuntime: true } }));
vi.mock('@/libs/hatchet', () => ({ enqueueHatchetTask: enqueue }));
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
    enqueue.mockReset().mockResolvedValue('queued');
    database = new PGlite();
    await database.exec(
      MCP_EVENT_BINDING_SCHEMA_SQL + MCP_EVENT_INBOX_SCHEMA_SQL + MCP_EVENT_WORK_SCHEMA_SQL,
    );
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
    expect(enqueue).toHaveBeenCalledWith('orvilo-mcp-event-inbox-sweep', {});
    const rows = await database.query<{ delivery: { rawBodyBase64: string } }>(
      'SELECT delivery FROM mcp_event_inbox',
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].delivery.rawBodyBase64).toBe(Buffer.from(raw).toString('base64'));
    expect(await (await request(raw)).json()).toEqual({ code: 'duplicate' });
  });

  it('retains the committed receipt if the durable wake-up enqueue fails', async () => {
    enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(occurrence());
      expect(response.status).toBe(202);
      expect((await database.query('SELECT status FROM mcp_event_inbox')).rows).toEqual([
        { status: 'pending' },
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it('returns a retryable 429 without accepting or waking an overloaded source queue', async () => {
    await database.query(`
      INSERT INTO mcp_event_inbox
        (id,tenant_id,subscription_id,event_id,connector_id,schema_id,payload_hash,delivery,received_at,available_at)
      SELECT 'full-' || n,'tenant-1','binding-1','full-event-' || n,'connector-1','message-v1',
        'hash','{}'::jsonb,1,1 FROM generate_series(1,1000) n
    `);
    const response = await request(occurrence());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(await response.json()).toEqual({ code: 'receiver_overloaded' });
    expect(enqueue).not.toHaveBeenCalled();
    expect(
      (await database.query('SELECT count(*)::integer AS size FROM mcp_event_inbox')).rows,
    ).toEqual([{ size: 1000 }]);
  });

  it('rejects byte tampering without persisting and does not ACK unavailable storage', async () => {
    expect((await request(occurrence(), true)).status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
    expect((await database.query('SELECT id FROM mcp_event_inbox')).rows).toEqual([]);
    connection.db = undefined;
    expect((await request(occurrence())).status).toBe(503);
  });

  it('rejects a signature forged under a different key before any persistence', async () => {
    const raw = occurrence();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const forged = createHmac('sha256', Buffer.alloc(32, 99))
      .update(`event-1.${timestamp}.`)
      .update(raw)
      .digest('base64');
    const response = await app.request('/api/webhooks/mcp-events/token-1', {
      body: raw,
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'event-1',
        'webhook-signature': `v1,${forged}`,
        'webhook-timestamp': timestamp,
        'x-mcp-subscription-id': 'remote-1',
      },
      method: 'POST',
    });
    expect(response.status).toBe(401);
    expect((await database.query('SELECT id FROM mcp_event_inbox')).rows).toEqual([]);
  });

  it('completes a delivery whose events match no enabled trigger', async () => {
    expect((await request(occurrence())).status).toBe(202);
    // The real admission service is installed — a delivery with no matching
    // trigger has no run to admit and settles completed.
    expect(await sweepMcpEventInbox(drizzle(database) as unknown as OrviloDatabase)).toMatchObject({
      claimed: 1,
      completed: 1,
      retried: 0,
    });
    expect((await database.query('SELECT status, attempts FROM mcp_event_inbox')).rows).toEqual([
      { attempts: 1, status: 'completed' },
    ]);
  });
});
