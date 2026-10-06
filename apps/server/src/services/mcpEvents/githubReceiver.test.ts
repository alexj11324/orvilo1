// @vitest-environment node
import { createHmac } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { McpEventBinding } from './deliveryTypes';
import { GitHubEventReceiver } from './githubReceiver';
import {
  MCP_EVENT_BINDING_SCHEMA_SQL,
  MCP_EVENT_INBOX_SCHEMA_SQL,
  SqlMcpEventBindingRepository,
  SqlMcpEventInbox,
} from './inbox';

const githubBinding: McpEventBinding = {
  callbackToken: 'github-token',
  callbackUrl: 'https://receiver.example/api/webhooks/github-events/github-token',
  connectorId: 'github-source',
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
  id: 'github-binding',
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
const secret = 'native-github-secret';
const event = {
  action: 'opened',
  pull_request: { id: 789, title: '中文 🌿' },
  repository: { id: 123 },
};
const delivery = 'cf181034-c776-4a5e-8b0c-1dcd607ff777';
const signedRequest = (raw: string, name = 'pull_request', headers: Record<string, string> = {}) =>
  new Request('https://receiver.example', {
    body: raw,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': delivery,
      'x-github-event': name,
      'x-github-hook-id': '456',
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
      ...headers,
    },
  });

describe('native GitHub receiver with the durable SQL inbox', () => {
  let database: PGlite;
  let bindings: SqlMcpEventBindingRepository;
  let receiver: GitHubEventReceiver;
  const decrypt = vi.fn().mockResolvedValue({ plaintext: secret, wasAuthentic: true });
  const receive = (raw: string, name?: string, headers?: Record<string, string>) =>
    receiver.receive(signedRequest(raw, name, headers), githubBinding.callbackToken);
  const ping = () =>
    receive(JSON.stringify({ hook: { id: 456 }, repository: { id: 123 } }), 'ping');
  beforeEach(async () => {
    decrypt.mockReset().mockResolvedValue({ plaintext: secret, wasAuthentic: true });
    database = new PGlite();
    await database.exec(MCP_EVENT_BINDING_SCHEMA_SQL + MCP_EVENT_INBOX_SCHEMA_SQL);
    bindings = new SqlMcpEventBindingRepository(database);
    await bindings.createPending(githubBinding);
    receiver = new GitHubEventReceiver({
      bindings,
      decrypt,
      inbox: new SqlMcpEventInbox(database),
    });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await database.close();
  });

  it('activates from a real signed ping and stores raw Unicode bytes before ACK, deduplicating delivery', async () => {
    expect(await (await ping()).json()).toEqual({ code: 'verified' });
    expect(await bindings.get(githubBinding, githubBinding.id)).toMatchObject({
      state: 'active',
      remoteSubscriptionId: '456',
      revision: 1,
    });
    expect(await (await ping()).json()).toEqual({ code: 'verified' });
    expect(await bindings.get(githubBinding, githubBinding.id)).toMatchObject({ revision: 1 });
    const raw = JSON.stringify(event, null, 2);
    expect(await (await receive(raw)).json()).toEqual({ code: 'accepted' });
    expect(await (await receive(raw)).json()).toEqual({ code: 'duplicate' });
    const rows = await database.query<{
      delivery: { event: { data: unknown }; rawBodyBase64: string };
      status: string;
    }>('SELECT delivery,status FROM mcp_event_inbox');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      delivery: { event: { data: event }, rawBodyBase64: Buffer.from(raw).toString('base64') },
      status: 'pending',
    });
    expect((await receive(raw + ' ')).status).toBe(409);
  });

  it.each([
    ['signature', event, { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) }, 401],
    ['repository', { ...event, repository: { id: 124 } }, {}, 400],
    ['hook', event, { 'x-github-hook-id': '457' }, 401],
    ['delivery', event, { 'x-github-delivery': 'not-a-uuid' }, 400],
    ['resource', { ...event, pull_request: { id: -1 } }, {}, 400],
    ['action', { ...event, action: 5 }, {}, 400],
  ])('rejects malformed %s without enqueueing', async (_label, body, headers, status) => {
    await ping();
    expect((await receive(JSON.stringify(body), 'pull_request', headers)).status).toBe(status);
    expect((await database.query('SELECT id FROM mcp_event_inbox')).rows).toEqual([]);
  });

  it('rejects pending events and invalid ping hook without modifying the binding', async () => {
    expect((await receive(JSON.stringify(event))).status).toBe(409);
    expect(
      (await receive(JSON.stringify({ hook: { id: 457 }, repository: { id: 123 } }), 'ping'))
        .status,
    ).toBe(400);
    expect(await bindings.get(githubBinding, githubBinding.id)).toMatchObject({
      state: 'pending',
      remoteSubscriptionId: null,
      revision: 0,
    });
  });

  it('rejects a stale ping update when the binding is stopped during verification', async () => {
    decrypt.mockImplementationOnce(async () => {
      await bindings.revoke(githubBinding, githubBinding.id, 0);
      return { plaintext: secret, wasAuthentic: true };
    });
    expect((await ping()).status).toBe(409);
    expect(await bindings.get(githubBinding, githubBinding.id)).toMatchObject({
      state: 'revoked',
      remoteSubscriptionId: null,
    });
    expect((await ping()).status).toBe(410);
  });

  it('fails closed on unauthentic ciphertext and invalid UTF-8', async () => {
    decrypt.mockResolvedValueOnce({ plaintext: secret, wasAuthentic: false });
    expect((await ping()).status).toBe(503);
    const bytes = Buffer.from([0xff]);
    const request = signedRequest('{}');
    request.headers.set(
      'x-hub-signature-256',
      `sha256=${createHmac('sha256', secret).update(bytes).digest('hex')}`,
    );
    expect(
      (
        await receiver.receive(
          new Request(request.url, { body: bytes, headers: request.headers, method: 'POST' }),
          githubBinding.callbackToken,
        )
      ).status,
    ).toBe(400);
  });

  it('ignores signed events for another event name without queueing', async () => {
    await ping();
    expect(
      await (
        await receive(JSON.stringify({ ...event, workflow_run: { id: 7 } }), 'workflow_run')
      ).json(),
    ).toEqual({ code: 'ignored' });
    expect((await database.query('SELECT id FROM mcp_event_inbox')).rows).toEqual([]);
  });

  it.each([undefined, '1'])(
    'bounds oversized streamed bodies with content length %s',
    async (length) => {
      const request = signedRequest('{}');
      if (length) request.headers.set('content-length', length);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(262_145));
          controller.close();
        },
      });
      expect(
        (
          await receiver.receive(
            new Request(request.url, {
              body: stream,
              duplex: 'half',
              headers: request.headers,
              method: 'POST',
            } as RequestInit),
            githubBinding.callbackToken,
          )
        ).status,
      ).toBe(413);
      expect(decrypt).not.toHaveBeenCalled();
    },
  );

  it('returns backpressure only after the durable inbox reports its capacity', async () => {
    await ping();
    await database.query(`INSERT INTO mcp_event_inbox (id,tenant_id,subscription_id,event_id,connector_id,schema_id,payload_hash,delivery,received_at,available_at)
      SELECT 'full-' || n,'tenant','github-binding','full-event-' || n,'github-source','github.pull_request','hash','{}'::jsonb,1,1 FROM generate_series(1,1000) n`);
    const response = await receive(JSON.stringify(event));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(
      (await database.query('SELECT count(*)::integer AS size FROM mcp_event_inbox')).rows,
    ).toEqual([{ size: 1000 }]);
  });
});
