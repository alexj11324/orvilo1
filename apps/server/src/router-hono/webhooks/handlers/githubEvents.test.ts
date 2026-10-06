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

import { githubEventsWebhook } from './githubEvents';

const connection = vi.hoisted(() => ({ db: undefined as McpEventsDatabase | undefined }));
const enqueue = vi.hoisted(() => vi.fn().mockResolvedValue('queued'));
vi.mock('@/server/services/mcpEvents/runtime', () => ({ scheduleMcpEventInboxSweep: enqueue }));
vi.mock('@/database/server', () => ({
  getServerDB: async () => {
    if (!connection.db) throw new Error('database unavailable');
    return connection.db;
  },
}));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: {
    initWithEnvKey: async () => ({
      decrypt: async () => ({ plaintext: 'secret', wasAuthentic: true }),
    }),
  },
}));

describe('GitHub Hono callback with committed SQL receipts', () => {
  const app = new Hono().post('/api/webhooks/github-events/:callbackToken', githubEventsWebhook);
  let database: PGlite;
  const request = (event: string, payload: unknown) => {
    const raw = JSON.stringify(payload);
    return app.request('/api/webhooks/github-events/token', {
      body: raw,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': 'cf181034-c776-4a5e-8b0c-1dcd607ff777',
        'x-github-event': event,
        'x-github-hook-id': '456',
        'x-hub-signature-256': `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`,
      },
    });
  };
  beforeEach(async () => {
    enqueue.mockReset().mockResolvedValue('queued');
    database = new PGlite();
    await database.exec(MCP_EVENT_BINDING_SCHEMA_SQL + MCP_EVENT_INBOX_SCHEMA_SQL);
    connection.db = drizzle(database);
    const binding: McpEventBinding = {
      callbackToken: 'token',
      callbackUrl: 'https://receiver.example/api/webhooks/github-events/token',
      connectorId: 'github',
      cursor: null,
      eventArguments: {},
      eventName: 'github.pull_request',
      expiresAt: null,
      github: {
        encryptedSecret: 'cipher',
        githubUserId: '42',
        grantRevision: 'grant',
        repositoryFullName: 'owner/repo',
        repositoryId: '123',
      },
      id: 'binding',
      payloadSchema: { type: 'object' },
      remoteSubscriptionId: null,
      revision: 0,
      schemaId: 'github.pull_request',
      signingKeys: [],
      sourceType: 'github',
      state: 'pending',
      tenantId: 'tenant',
      truncated: false,
    };
    await new SqlMcpEventBindingRepository(database).createPending(binding);
  });
  afterEach(async () => {
    connection.db = undefined;
    vi.restoreAllMocks();
    await database.close();
  });

  it('activates ping without waking, then queues and wakes only accepted and duplicate events', async () => {
    expect((await request('ping', { hook: { id: 456 }, repository: { id: 123 } })).status).toBe(
      200,
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(await (await request('workflow_run', { repository: { id: 123 } })).json()).toEqual({
      code: 'ignored',
    });
    expect(enqueue).not.toHaveBeenCalled();
    const payload = { action: 'opened', pull_request: { id: 789 }, repository: { id: 123 } };
    expect(await (await request('pull_request', payload)).json()).toEqual({ code: 'accepted' });
    expect(await (await request('pull_request', payload)).json()).toEqual({ code: 'duplicate' });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect((await database.query('SELECT status FROM mcp_event_inbox')).rows).toEqual([
      { status: 'pending' },
    ]);
  });

  it('keeps receipt pending if wake-up fails and rejects storage failure without ACK', async () => {
    await request('ping', { hook: { id: 456 }, repository: { id: 123 } });
    enqueue.mockRejectedValueOnce(new Error('queue unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      (
        await request('pull_request', {
          action: 'opened',
          pull_request: { id: 789 },
          repository: { id: 123 },
        })
      ).status,
    ).toBe(202);
    expect((await database.query('SELECT status FROM mcp_event_inbox')).rows).toEqual([
      { status: 'pending' },
    ]);
    connection.db = undefined;
    expect((await request('ping', { hook: { id: 456 }, repository: { id: 123 } })).status).toBe(
      503,
    );
  });
});
