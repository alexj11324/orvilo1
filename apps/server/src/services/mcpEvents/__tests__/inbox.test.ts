import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AcceptedMcpEvent, McpEventBinding } from '../deliveryTypes';
import {
  MCP_EVENT_BINDING_SCHEMA_SQL,
  MCP_EVENT_INBOX_SCHEMA_SQL,
  SqlMcpEventBindingRepository,
  SqlMcpEventInbox,
} from '../inbox';

const scope = { tenantId: 'tenant-a', connectorId: 'connector-a' };
const binding: McpEventBinding = {
  ...scope,
  id: 'binding-a',
  revision: 0,
  schemaId: 'schema-a',
  callbackToken: 'opaque-a',
  callbackUrl: 'https://receiver.example/events/opaque-a',
  eventName: 'comment.created',
  eventArguments: {},
  remoteSubscriptionId: null,
  state: 'pending',
  signingKeys: [],
  expiresAt: null,
  payloadSchema: { type: 'object' },
  cursor: null,
  truncated: false,
};

describe('SQL inbox binding and lifecycle fences', () => {
  let database: PGlite;
  let bindings: SqlMcpEventBindingRepository;
  let inbox: SqlMcpEventInbox;
  let input: AcceptedMcpEvent;

  beforeEach(async () => {
    database = new PGlite();
    await database.exec(MCP_EVENT_BINDING_SCHEMA_SQL + MCP_EVENT_INBOX_SCHEMA_SQL);
    bindings = new SqlMcpEventBindingRepository(database);
    inbox = new SqlMcpEventInbox(database);
    await bindings.createPending(binding);
    await bindings.verifyPending('opaque-a', 'remote-a', 'challenge-a', 'fresh-challenge', 1);
    await bindings.update(scope, binding.id, 'pending', { state: 'active' }, 0);
    const event = {
      eventId: 'evt-a',
      name: binding.eventName,
      timestamp: '2026-09-30T00:00:00Z',
      data: {},
      cursor: 'watermark-a',
    };
    input = {
      ...scope,
      subscriptionId: binding.id,
      schemaId: binding.schemaId,
      bindingRevision: 1,
      event,
      rawBody: Buffer.from(JSON.stringify(event)),
      receivedAt: 10,
    };
  });

  afterEach(async () => {
    await database.close();
  });

  it('commits the receipt and safe replay watermark together; a conflicting retry cannot advance it', async () => {
    expect(await inbox.accept(input)).toBe('accepted');
    expect((await bindings.get(scope, binding.id))?.cursor).toBe('watermark-a');
    expect(await inbox.accept(input)).toBe('duplicate');
    expect(
      await inbox.accept({
        ...input,
        event: { ...input.event, cursor: 'bad' },
        rawBody: Buffer.from('changed'),
      }),
    ).toBe('conflict');
    expect((await bindings.get(scope, binding.id))?.cursor).toBe('watermark-a');
  });

  it('rejects stale rotation snapshots, revoked bindings and cross-tenant receipt attempts', async () => {
    await expect(inbox.accept({ ...input, tenantId: 'tenant-b' })).rejects.toThrow();
    await bindings.update(scope, binding.id, 'active', { signingKeys: [] }, 1);
    await expect(inbox.accept(input)).rejects.toThrow();
    await bindings.revoke(scope, binding.id);
    await expect(inbox.accept({ ...input, bindingRevision: 2 })).rejects.toThrow();
    expect(
      (await database.query<{ count: string }>('SELECT count(*) FROM mcp_event_inbox')).rows[0]
        .count,
    ).toBe(0);
  });

  it('serializes renewal claims and rejects late lifecycle writes', async () => {
    const lease = await bindings.claimRefresh(scope, binding.id, 10, 100);
    expect(lease?.revision).toBe(2);
    expect(await bindings.claimRefresh(scope, binding.id, 20, 100)).toBeUndefined();
    expect(
      await bindings.update(scope, binding.id, 'active', { cursor: 'stale' }, 1),
    ).toBeUndefined();
    await bindings.revoke(scope, binding.id);
    expect(
      await bindings.update(scope, binding.id, 'active', { state: 'active' }, 2),
    ).toBeUndefined();
  });

  it('preserves a receipt cursor when a concurrent renewal returns an older watermark', async () => {
    await inbox.accept(input);
    const updated = await bindings.update(
      scope,
      binding.id,
      'active',
      { cursor: 'older' },
      1,
      null,
    );
    expect(updated?.cursor).toBe('watermark-a');
  });

  it('does not bind a second provider ID or consume a challenge twice', async () => {
    expect(
      await bindings.verifyPending('opaque-a', 'remote-a', 'challenge-a', 'fresh-challenge', 2),
    ).toBe(false);
    expect(
      await bindings.verifyPending('opaque-a', 'remote-b', 'challenge-b', 'other-challenge', 2),
    ).toBe(false);
    expect((await bindings.get(scope, binding.id))?.remoteSubscriptionId).toBe('remote-a');
  });

  it('fences an expired acknowledgement even before another worker claims it', async () => {
    await inbox.accept(input);
    const [delivery] = await inbox.claim(10, 100);
    expect(
      await inbox.settle(delivery.id, delivery.leaseToken!, 110, { status: 'completed' }),
    ).toBe(false);
    const [replacement] = await inbox.claim(110, 100);
    expect(replacement.attempts).toBe(2);
    expect(replacement.leaseToken).not.toBe(delivery.leaseToken);
    expect(
      await inbox.settle(replacement.id, replacement.leaseToken!, 111, { status: 'completed' }),
    ).toBe(true);
  });

  it('gives concurrent claimers disjoint durable work', async () => {
    await inbox.accept(input);
    const second = { ...input, event: { ...input.event, eventId: 'evt-b' } };
    second.rawBody = Buffer.from(JSON.stringify(second.event));
    await inbox.accept(second);
    const claims = await Promise.all(Array.from({ length: 4 }, () => inbox.claim(10, 100, 1)));
    const deliveries = claims.flat();
    expect(deliveries).toHaveLength(2);
    expect(new Set(deliveries.map((delivery) => delivery.id)).size).toBe(2);
    expect(new Set(deliveries.map((delivery) => delivery.leaseToken)).size).toBe(2);
    expect(deliveries.map((delivery) => delivery.attempts)).toEqual([1, 1]);
  });
});
