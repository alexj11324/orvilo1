// @vitest-environment node
import { createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AcceptedMcpEvent, McpEventBinding } from './deliveryTypes';
import {
  MCP_EVENT_BINDING_SCHEMA_SQL,
  MCP_EVENT_INBOX_SCHEMA_SQL,
  SqlMcpEventBindingRepository,
  SqlMcpEventInbox,
} from './inbox';
import { McpEventReceiver } from './receiver';

// Real PostgreSQL execution and a filesystem reopen, with no internal service mocks.
describe('MCP Events durable acceptance', () => {
  let directory: string;
  let database: PGlite;
  let inbox: SqlMcpEventInbox;
  let bindings: SqlMcpEventBindingRepository;
  let receiver: McpEventReceiver;
  const now = Date.parse('2026-09-30T12:00:00Z');
  const secretBytes = Buffer.alloc(32, 7);
  const binding = (): McpEventBinding => ({
    callbackToken: 'callback-a',
    callbackUrl: 'https://callback.example/mcp-events/callback-a',
    connectorId: 'connector-a',
    cursor: null,
    eventArguments: { channel: 'C123' },
    eventName: 'slack.message',
    expiresAt: now + 60_000,
    id: 'binding-a',
    payloadSchema: {
      properties: { channel: { type: 'string' }, text: { type: 'string' } },
      required: ['channel', 'text'],
      type: 'object',
    },
    remoteSubscriptionId: null,
    revision: 0,
    schemaId: 'slack.message-v1',
    signingKeys: [{ secret: `whsec_${secretBytes.toString('base64')}` }],
    state: 'pending',
    tenantId: 'tenant-a',
    truncated: false,
  });

  // Construct the signed wire message independently of the receiver's verifier.
  const request = (body: string, id = 'event-1', timestamp = Math.floor(now / 1000)) => {
    const signature = createHmac('sha256', secretBytes)
      .update(`${id}.${timestamp}.`)
      .update(Buffer.from(body))
      .digest('base64');
    return new Request(binding().callbackUrl, {
      body,
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-signature': `v1,${signature}`,
        'webhook-timestamp': String(timestamp),
        'x-mcp-subscription-id': 'remote-a',
      },
      method: 'POST',
    });
  };

  const activate = async () => {
    const verification = request(
      JSON.stringify({ challenge: 'challenge-a', type: 'verification' }),
      'challenge-1',
    );
    const response = await receiver.receive(verification, binding().callbackToken);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ challenge: 'challenge-a' });
    const active = await bindings.update(
      binding(),
      binding().id,
      'pending',
      { state: 'active' },
      0,
    );
    expect(active?.remoteSubscriptionId).toBe('remote-a');
    return active!;
  };

  const event = (tenantId = 'tenant-a', eventId = 'event-1'): AcceptedMcpEvent => {
    const occurrence = {
      data: { channel: 'C123', text: 'Review this change' },
      eventId,
      name: 'slack.message',
      timestamp: new Date(now).toISOString(),
    };
    return {
      bindingRevision: 1,
      connectorId: 'connector-a',
      event: occurrence,
      rawBody: Buffer.from(JSON.stringify(occurrence)),
      receivedAt: now,
      schemaId: 'slack.message-v1',
      subscriptionId: tenantId === 'tenant-a' ? 'binding-a' : 'binding-b',
      tenantId,
    };
  };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mcp-events-acceptance-'));
    database = new PGlite(directory);
    await database.exec(MCP_EVENT_INBOX_SCHEMA_SQL);
    await database.exec(MCP_EVENT_BINDING_SCHEMA_SQL);
    inbox = new SqlMcpEventInbox(database);
    bindings = new SqlMcpEventBindingRepository(database);
    receiver = new McpEventReceiver({ bindings, inbox, now: () => now });
    await bindings.createPending(binding());
  });

  afterEach(async () => {
    await database.close();
    await rm(directory, { force: true, recursive: true });
  });

  it('commits one occurrence under concurrent retries and refuses identity collisions', async () => {
    await activate();
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => inbox.accept(event())));
    expect(outcomes.filter((outcome) => outcome === 'accepted')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'duplicate')).toHaveLength(7);
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toHaveLength(1);

    expect(await inbox.accept({ ...event(), rawBody: Buffer.from('{"changed":true}') })).toBe(
      'conflict',
    );
    await expect(inbox.accept({ ...event(), connectorId: 'connector-other' })).rejects.toThrow();
    await expect(inbox.accept({ ...event(), schemaId: 'schema-other' })).rejects.toThrow();
    // The same remote identity in another tenant cannot collide with tenant A.
    const other = {
      ...binding(),
      callbackToken: 'callback-b',
      id: 'binding-b',
      tenantId: 'tenant-b',
    };
    await bindings.createPending(other);
    await bindings.verifyPending('callback-b', 'remote-b', 'challenge-b', 'challenge-b', now);
    await bindings.update(other, other.id, 'pending', { state: 'active' }, 0);
    expect(await inbox.accept(event('tenant-b'))).toBe('accepted');
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toHaveLength(2);
  });

  it('recovers persisted leased work after reopen and fences stale acknowledgements', async () => {
    await activate();
    await inbox.accept(event());
    const [first] = await inbox.claim(now, 1000);
    expect(first.attempts).toBe(1);
    await database.close();
    database = new PGlite(directory);
    inbox = new SqlMcpEventInbox(database);

    expect(await inbox.claim(now + 999, 1000)).toEqual([]);
    const [recovered] = await inbox.claim(now + 1000, 1000);
    expect(recovered.id).toBe(first.id);
    expect(recovered.attempts).toBe(2);
    expect(recovered.leaseToken).not.toBe(first.leaseToken);
    expect(
      await inbox.settle(first.id, first.leaseToken!, now + 1001, { status: 'completed' }),
    ).toBe(false);
    expect(
      await inbox.settle(recovered.id, recovered.leaseToken!, now + 1001, { status: 'completed' }),
    ).toBe(true);
    expect(await inbox.claim(now + 3000, 1000)).toEqual([]);
    expect(await inbox.accept(event())).toBe('duplicate');
  });

  it('persists retry visibility and terminal failures without dropping their evidence', async () => {
    await activate();
    await inbox.accept(event());
    const [first] = await inbox.claim(now, 1000);
    expect(
      await inbox.settle(first.id, first.leaseToken!, now + 1, {
        availableAt: now + 5000,
        errorCode: 'runtime_unavailable',
        status: 'pending',
      }),
    ).toBe(true);
    expect(await inbox.claim(now + 4999, 1000)).toEqual([]);
    const [retried] = await inbox.claim(now + 5000, 1000);
    expect(retried.lastError).toBe('runtime_unavailable');
    expect(retried.rawBodyBase64).toBe(Buffer.from(event().rawBody).toString('base64'));
    expect(
      await inbox.settle(retried.id, retried.leaseToken!, now + 5001, {
        availableAt: now + 5001,
        errorCode: 'retry_exhausted',
        status: 'dead',
      }),
    ).toBe(true);
    expect(await inbox.claim(now + 10000, 1000)).toEqual([]);
    const rows = await database.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM mcp_event_inbox',
    );
    expect(rows.rows).toEqual([{ last_error: 'retry_exhausted', status: 'dead' }]);
  });

  it('consumes signed verification separately and persists one raw occurrence across redelivery', async () => {
    await activate();
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toEqual([]);
    const raw = JSON.stringify(event().event, null, 2);
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => receiver.receive(request(raw), 'callback-a')),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 6 }, () => 202),
    );
    const codes = await Promise.all(responses.map((response) => response.json()));
    expect(codes.filter((body) => body.code === 'accepted')).toHaveLength(1);
    expect(codes.filter((body) => body.code === 'duplicate')).toHaveLength(5);
    const [delivery] = await inbox.claim(now, 1000);
    expect(delivery.rawBodyBase64).toBe(Buffer.from(raw).toString('base64'));
    expect(delivery.tenantId).toBe('tenant-a');
    expect(delivery.subscriptionId).toBe('binding-a');
    expect(
      await receiver.receive(
        request(JSON.stringify({ challenge: 'challenge-a', type: 'verification' }), 'challenge-1'),
        'callback-a',
      ),
    ).toHaveProperty('status', 409);
  });

  it('rejects byte tampering, stale signatures, wrong remote identity and unknown callbacks with no inbox writes', async () => {
    await activate();
    const raw = JSON.stringify(event().event);
    const signed = request(raw);
    const tampered = new Request(signed.url, {
      body: `${raw} `,
      headers: signed.headers,
      method: 'POST',
    });
    const wrongIdentity = request(raw);
    wrongIdentity.headers.set('x-mcp-subscription-id', 'remote-other');
    expect((await receiver.receive(tampered, 'callback-a')).status).toBe(401);
    expect(
      (await receiver.receive(request(raw, 'event-1', Math.floor(now / 1000) - 301), 'callback-a'))
        .status,
    ).toBe(401);
    expect((await receiver.receive(wrongIdentity, 'callback-a')).status).toBe(401);
    expect((await receiver.receive(request(raw), 'unknown-callback')).status).toBe(404);
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toEqual([]);
  });

  it('rejects malformed and mismatched envelopes and invalid payload data without accepting work', async () => {
    await activate();
    const occurrence = event().event;
    const invalidBodies = [
      '{',
      JSON.stringify({ ...occurrence, eventId: 'other-event' }),
      JSON.stringify({ ...occurrence, name: 'github.push' }),
      JSON.stringify({ ...occurrence, timestamp: 'yesterday' }),
      JSON.stringify({ ...occurrence, data: { channel: 42, text: 'bad channel' } }),
      JSON.stringify({ ...occurrence, type: 'terminated' }),
    ];
    for (const raw of invalidBodies) {
      expect((await receiver.receive(request(raw), 'callback-a')).status).toBe(400);
    }
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toEqual([]);
  });

  it('rejects pending, expired and revoked bindings, including stale signing rotation keys', async () => {
    const raw = JSON.stringify(event().event);
    expect((await receiver.receive(request(raw), 'callback-a')).status).toBe(409);
    const active = await activate();
    const updated = await bindings.update(
      binding(),
      binding().id,
      'active',
      {
        signingKeys: [{ expiresAt: now, secret: active.signingKeys[0].secret }],
      },
      active.revision,
    );
    expect((await receiver.receive(request(raw), 'callback-a')).status).toBe(401);
    await bindings.update(binding(), binding().id, 'active', { expiresAt: now }, updated!.revision);
    expect((await receiver.receive(request(raw), 'callback-a')).status).toBe(410);
    await bindings.revoke(binding(), binding().id);
    expect((await receiver.receive(request(raw), 'callback-a')).status).toBe(410);
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toEqual([]);
  });

  it('does not permit another tenant or connector to mutate the callback binding', async () => {
    const active = await activate();
    for (const scope of [
      { connectorId: active.connectorId, tenantId: 'tenant-other' },
      { connectorId: 'connector-other', tenantId: active.tenantId },
    ]) {
      expect(await bindings.get(scope, active.id)).toBeUndefined();
      expect(
        await bindings.update(scope, active.id, 'active', { state: 'revoked' }, active.revision),
      ).toBeUndefined();
      await bindings.revoke(scope, active.id);
    }
    expect((await bindings.get(active, active.id))?.state).toBe('active');
    const other = {
      ...binding(),
      callbackToken: 'callback-b',
      id: 'binding-b',
      tenantId: 'tenant-b',
    };
    await bindings.createPending(other);
    await bindings.verifyPending('callback-b', 'remote-b', 'challenge-b', 'challenge-b', now);
    await bindings.update(other, other.id, 'pending', { state: 'active' }, 0);
    await inbox.accept(event('tenant-a', 'event-a'));
    await inbox.accept(event('tenant-b', 'event-b'));
    const claimed = await inbox.claim(now, 1000, 20, 'tenant-a');
    expect(claimed.map((delivery) => delivery.event.eventId)).toEqual(['event-a']);
  });

  it('caps actual body bytes even when content-length is absent', async () => {
    await activate();
    const oversized = JSON.stringify({
      ...event().event,
      data: { channel: 'C123', text: 'x'.repeat(262_144) },
    });
    expect((await receiver.receive(request(oversized), 'callback-a')).status).toBe(413);
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toEqual([]);
  });

  it('does not roll back the saved cursor when an older occurrence is retried', async () => {
    await activate();
    const first = { ...event(), event: { ...event().event, cursor: 'cursor-1' } };
    const second = {
      ...event('tenant-a', 'event-2'),
      event: { ...event('tenant-a', 'event-2').event, cursor: 'cursor-2' },
    };
    first.rawBody = Buffer.from(JSON.stringify(first.event));
    second.rawBody = Buffer.from(JSON.stringify(second.event));
    expect(await inbox.accept(first)).toBe('accepted');
    expect(await inbox.accept(second)).toBe('accepted');
    expect(await inbox.accept(first)).toBe('duplicate');
    expect((await bindings.get(binding(), binding().id))?.cursor).toBe('cursor-2');
  });

  it('does not acknowledge before the SQL commit resolves', async () => {
    await activate();
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    // The SQL transport boundary is delayed; the receiver and inbox are real.
    const delayedInbox = new SqlMcpEventInbox({
      async transaction(work) {
        reached();
        await gate;
        return database.transaction(work);
      },
      async query<T>(sql: string, parameters?: unknown[]) {
        reached();
        await gate;
        return database.query<T>(sql, parameters);
      },
    });
    const delayedReceiver = new McpEventReceiver({ bindings, inbox: delayedInbox, now: () => now });
    let acknowledged = false;
    const response = delayedReceiver
      .receive(request(JSON.stringify(event().event)), 'callback-a')
      .then((result) => {
        acknowledged = true;
        return result;
      });
    await entered;
    try {
      expect(acknowledged).toBe(false);
      expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toEqual([]);
    } finally {
      release();
    }
    expect((await response).status).toBe(202);
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toHaveLength(1);
  });

  it('rolls back the receipt if its watermark cannot commit and permits a later retry', async () => {
    await activate();
    await database.exec(`
      CREATE FUNCTION reject_test_watermark() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test storage failure'; END $$;
      CREATE TRIGGER reject_watermark BEFORE UPDATE ON mcp_event_bindings
      FOR EACH ROW EXECUTE FUNCTION reject_test_watermark();
    `);
    const raw = JSON.stringify({ ...event().event, cursor: 'next-cursor' });
    const rejected = await receiver.receive(request(raw), 'callback-a');
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toEqual({ code: 'receiver_unavailable' });
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toEqual([]);
    expect((await bindings.get(binding(), binding().id))?.cursor).toBeNull();
    await database.exec('DROP TRIGGER reject_watermark ON mcp_event_bindings');
    expect((await receiver.receive(request(raw), 'callback-a')).status).toBe(202);
    expect((await database.query('SELECT * FROM mcp_event_inbox')).rows).toHaveLength(1);
    expect((await bindings.get(binding(), binding().id))?.cursor).toBe('next-cursor');
  });
});
