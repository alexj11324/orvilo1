// @vitest-environment node
import { createHmac } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { McpEventsTransport } from './adapter';
import { McpEventsAdapter } from './adapter';
import {
  MCP_EVENT_BINDING_SCHEMA_SQL,
  MCP_EVENT_INBOX_SCHEMA_SQL,
  SqlMcpEventBindingRepository,
  SqlMcpEventInbox,
} from './inbox';
import type { McpSubscribeParams } from './protocol';
import { McpEventReceiver } from './receiver';
import type { McpSubscriptionDependencies } from './subscription';
import { McpEventSubscriptionService } from './subscription';

// Only the external provider is simulated. Lifecycle storage and ingress execute real services/SQL.
describe('MCP subscription lifecycle against SQL and signed ingress', () => {
  let database: PGlite;
  let repository: SqlMcpEventBindingRepository;
  let receiver: McpEventReceiver;
  let service: McpEventSubscriptionService;
  let dependencies: McpSubscriptionDependencies;
  let now: number;
  let subscribe: (params: McpSubscribeParams) => Promise<unknown>;
  let unsubscribed: number;
  const scope = { connectorId: 'connector-a', tenantId: 'tenant-a' };
  const input = {
    ...scope,
    arguments: {},
    schemaId: 'schema-a',
    event: {
      name: 'comment.created',
      delivery: ['webhook'] as ['webhook'],
      inputSchema: { type: 'object' },
      payloadSchema: { type: 'object' },
    },
  };
  const grant = () => ({
    id: 'remote-a',
    cursor: null,
    truncated: false,
    refreshBefore: new Date(now + 600_000).toISOString(),
  });
  const signed = (
    params: McpSubscribeParams,
    body: unknown,
    id: string,
    secret = params.delivery.secret,
  ) => {
    const raw = JSON.stringify(body);
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
      .update(`${id}.${timestamp}.${raw}`)
      .digest('base64');
    return new Request(params.delivery.url, {
      method: 'POST',
      body: raw,
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': `v1,${signature}`,
        'x-mcp-subscription-id': 'remote-a',
      },
    });
  };
  const receive = (params: McpSubscribeParams, body: unknown, id: string, secret?: string) =>
    receiver.receive(
      signed(params, body, id, secret),
      new URL(params.delivery.url).pathname.split('/').at(-1)!,
    );
  const occurrence = (id: string) => ({
    eventId: id,
    name: input.event.name,
    timestamp: new Date(now).toISOString(),
    data: {},
  });

  beforeEach(async () => {
    now = Date.parse('2026-09-30T12:00:00Z');
    database = new PGlite();
    await database.exec(MCP_EVENT_BINDING_SCHEMA_SQL + MCP_EVENT_INBOX_SCHEMA_SQL);
    repository = new SqlMcpEventBindingRepository(database);
    receiver = new McpEventReceiver({
      bindings: repository,
      inbox: new SqlMcpEventInbox(database),
      now: () => now,
    });
    unsubscribed = 0;
    subscribe = async (params) => {
      expect(
        (await receive(params, { type: 'verification', challenge: 'challenge-a' }, 'verify-a'))
          .status,
      ).toBe(200);
      return grant();
    };
    const transport: McpEventsTransport = {
      async request(method, params) {
        if (method === 'events/unsubscribe') {
          unsubscribed++;
          return {};
        }
        return subscribe(params as unknown as McpSubscribeParams);
      },
    };
    dependencies = {
      repository,
      now: () => now,
      callbackUrl: (token) => `https://receiver.example/events/${token}`,
      adapterFor: async () => new McpEventsAdapter(transport),
    };
    service = new McpEventSubscriptionService(dependencies);
  });
  afterEach(async () => {
    await database.close();
  });

  it('persists pending before synchronous verification and retries occurrences until activation', async () => {
    let wire: McpSubscribeParams;
    subscribe = async (params) => {
      wire = params;
      const token = new URL(params.delivery.url).pathname.split('/').at(-1)!;
      expect((await repository.findByCallbackToken(token))?.state).toBe('pending');
      expect(
        (await receive(params, { type: 'verification', challenge: 'challenge-a' }, 'verify-a'))
          .status,
      ).toBe(200);
      expect((await receive(params, occurrence('event-a'), 'event-a')).status).toBe(409);
      return grant();
    };
    const binding = await service.create(input);
    expect(binding.state).toBe('active');
    expect((await receive(wire!, occurrence('event-a'), 'event-a')).status).toBe(202);
    expect((await database.query('SELECT id FROM mcp_event_inbox')).rows).toHaveLength(1);
  });

  it('retains all unexpired keys after a lost rotation acknowledgement', async () => {
    const initial = await service.create(input);
    subscribe = async () => grant();
    const rotated = await service.refresh(scope, initial.id, true);
    const olderKey = rotated.signingKeys[1];
    subscribe = async () => {
      throw new Error('response lost');
    };
    await expect(service.refresh(scope, initial.id, true)).rejects.toThrow('response lost');
    const uncertain = await repository.get(scope, initial.id);
    expect(uncertain?.signingKeys.some((key) => key.secret === olderKey.secret)).toBe(true);
    expect(uncertain?.signingKeys).toHaveLength(3);
  });

  it('accepts old and new signatures during grace then rejects expired old signatures', async () => {
    const initial = await service.create(input);
    let wire: McpSubscribeParams;
    subscribe = async (params) => {
      wire = params;
      return grant();
    };
    const rotated = await service.refresh(scope, initial.id, true);
    expect(rotated.signingKeys[0].secret).not.toBe(initial.signingKeys[0].secret);
    expect(
      (await receive(wire!, occurrence('event-old'), 'event-old', initial.signingKeys[0].secret))
        .status,
    ).toBe(202);
    expect((await receive(wire!, occurrence('event-new'), 'event-new')).status).toBe(202);
    now += 300_000;
    expect(
      (
        await receive(
          wire!,
          occurrence('event-expired'),
          'event-expired',
          initial.signingKeys[0].secret,
        )
      ).status,
    ).toBe(401);
  });

  it('cannot reactivate after stop races a refresh', async () => {
    const initial = await service.create(input);
    subscribe = async () => {
      await service.stop(scope, initial.id);
      return grant();
    };
    await expect(service.refresh(scope, initial.id)).rejects.toThrow();
    expect((await repository.get(scope, initial.id))?.state).toBe('revoked');
    expect(unsubscribed).toBeGreaterThan(0);
  });

  it('revokes an unauthorized renewal and cleans its remote identity', async () => {
    const initial = await service.create(input);
    subscribe = async () => {
      throw { code: -32012 };
    };
    await expect(service.refresh(scope, initial.id)).rejects.toEqual({ code: -32012 });
    expect((await repository.get(scope, initial.id))?.state).toBe('revoked');
    expect(unsubscribed).toBe(1);
  });

  it('reports contract-revoked renewal and retains replay gap evidence', async () => {
    const initial = await service.create(input);
    subscribe = async () => ({ ...grant(), truncated: true, cursor: 'gap-watermark' });
    expect(await service.refresh(scope, initial.id)).toMatchObject({
      truncated: true,
      cursor: 'gap-watermark',
    });
    subscribe = async () => ({ ...grant(), id: 'changed-identity' });
    now += 550_000;
    expect(await service.renewDue()).toEqual([{ id: initial.id, status: 'revoked' }]);
  });
  it('rechecks signature freshness after a slowly received body', async () => {
    const initial = await service.create(input);
    const params: McpSubscribeParams = {
      arguments: {},
      cursor: null,
      name: input.event.name,
      delivery: {
        mode: 'webhook',
        secret: initial.signingKeys[0].secret,
        url: initial.callbackUrl,
      },
    };
    const original = signed(params, occurrence('slow-event'), 'slow-event');
    const bytes = new Uint8Array(await original.arrayBuffer());
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        now += 301_000;
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const streamed = new Request(original.url, {
      method: 'POST',
      headers: original.headers,
      body,
      duplex: 'half',
    } as RequestInit);
    expect((await receiver.receive(streamed, initial.callbackToken)).status).toBe(401);
    expect((await database.query('SELECT id FROM mcp_event_inbox')).rows).toHaveLength(0);
  });

  it('rejects a challenge if signing authority rotates before its durable commit', async () => {
    const initial = await service.create(input);
    receiver = new McpEventReceiver({
      now: () => now,
      inbox: new SqlMcpEventInbox(database),
      bindings: {
        findByCallbackToken: (token) => repository.findByCallbackToken(token),
        async verifyPending(token, remoteId, webhookId, challenge, receivedAt, revision) {
          await repository.update(
            scope,
            initial.id,
            'active',
            { signingKeys: [] },
            initial.revision,
          );
          return repository.verifyPending(
            token,
            remoteId,
            webhookId,
            challenge,
            receivedAt,
            revision,
          );
        },
      },
    });
    const params: McpSubscribeParams = {
      arguments: {},
      cursor: null,
      name: input.event.name,
      delivery: {
        mode: 'webhook',
        secret: initial.signingKeys[0].secret,
        url: initial.callbackUrl,
      },
    };
    expect(
      (await receive(params, { type: 'verification', challenge: 'new-challenge' }, 'verify-new'))
        .status,
    ).toBe(409);
    expect((await database.query('SELECT id FROM mcp_event_challenges')).rows).toHaveLength(1);
  });

  it('revokes an unverified subscription rather than activating from the remote response alone', async () => {
    subscribe = async () => grant();
    await expect(service.create(input)).rejects.toThrow('not verified');
    expect(
      (await database.query<{ state: string }>('SELECT state FROM mcp_event_bindings')).rows,
    ).toEqual([{ state: 'revoked' }]);
    expect(unsubscribed).toBe(1);
  });

  it.each(['forbidden', 'contract'] as const)(
    'does not let an expired renewal revoke a successor renewal on %s failure',
    async (failure) => {
      const initial = await service.create(input);
      let releaseOld!: () => void;
      let entered!: () => void;
      const enteredOld = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const oldResponse = new Promise<void>((resolve) => {
        releaseOld = resolve;
      });
      let calls = 0;
      subscribe = async () => {
        if (++calls === 1) {
          entered();
          await oldResponse;
          if (failure === 'forbidden') throw { code: -32012 };
          return { ...grant(), id: 'changed-identity' };
        }
        return grant();
      };
      const old = service.refresh(scope, initial.id);
      const rejected =
        failure === 'forbidden'
          ? expect(old).rejects.toEqual({ code: -32012 })
          : expect(old).rejects.toThrow('ID changed');
      await enteredOld;
      now += 60_001;
      const successor = await service.refresh(scope, initial.id);
      releaseOld();
      await rejected;
      expect((await repository.get(scope, initial.id))?.state).toBe('active');
      expect((await repository.get(scope, initial.id))?.revision).toBe(successor.revision);
      expect(unsubscribed).toBe(0);
    },
  );
  it.each([120_000, 480_000])(
    'rejects a %sms grant outside the deployment maintenance window and cleans it up',
    async (lifetime) => {
      service = new McpEventSubscriptionService({
        ...dependencies,
        minimumRefreshWindowMs: 480_000,
      });
      const verifiedSubscribe = subscribe;
      subscribe = async (params) => ({
        ...((await verifiedSubscribe(params)) as Record<string, unknown>),
        refreshBefore: new Date(now + lifetime).toISOString(),
      });
      await expect(service.create(input)).rejects.toThrow('maintenance window');
      expect(
        (await database.query<{ state: string }>('SELECT state FROM mcp_event_bindings')).rows,
      ).toEqual([{ state: 'revoked' }]);
      expect(unsubscribed).toBe(1);
    },
  );

  it('accepts a grant beyond the deployment maintenance window', async () => {
    service = new McpEventSubscriptionService({ ...dependencies, minimumRefreshWindowMs: 480_000 });
    expect((await service.create(input)).state).toBe('active');
    expect(unsubscribed).toBe(0);
  });
});
