// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AcceptedMcpEvent, McpEventBinding } from './deliveryTypes';
import { matchesMcpEventFilters } from './filter';
import {
  MCP_EVENT_BINDING_SCHEMA_SQL,
  MCP_EVENT_INBOX_SCHEMA_SQL,
  SqlMcpEventBindingRepository,
  SqlMcpEventInbox,
} from './inbox';
import { McpEventWorker } from './worker';
import {
  MCP_EVENT_WORK_SCHEMA_SQL,
  SqlMcpEventTriggerRepository,
  SqlMcpEventWorkRepository,
} from './workerRepository';

/** Real SQL repositories. Core admission is an explicit boundary, not a runtime claim. */
describe('MCP event durable worker', () => {
  let db: PGlite;
  let directory: string;
  let inbox: SqlMcpEventInbox;
  let bindings: SqlMcpEventBindingRepository;
  let repository: SqlMcpEventWorkRepository;
  let triggers: SqlMcpEventTriggerRepository;
  let now: number;
  const binding: McpEventBinding = {
    id: 'binding',
    revision: 0,
    tenantId: 'tenant',
    connectorId: 'connector',
    schemaId: 'schema',
    callbackToken: 'token',
    callbackUrl: 'https://receiver.test/events/token',
    eventName: 'message',
    eventArguments: {},
    remoteSubscriptionId: null,
    state: 'pending',
    signingKeys: [],
    expiresAt: null,
    payloadSchema: {},
    cursor: null,
    truncated: false,
  };
  const trigger = {
    id: 'trigger',
    tenantId: 'tenant',
    workspaceId: 'workspace',
    userId: 'user',
    taskId: 'task',
    subscriptionId: 'binding',
    sourceId: 'connector',
    enabled: true,
    filters: [{ path: ['text'], operator: 'contains' as const, value: 'hello' }],
  };
  const event = (id = 'event', text = 'hello'): AcceptedMcpEvent => {
    const occurrence = {
      eventId: id,
      name: 'message',
      data: { text },
      timestamp: '2026-09-30T00:00:00Z',
      cursor: id,
    };
    return {
      tenantId: 'tenant',
      connectorId: 'connector',
      subscriptionId: 'binding',
      schemaId: 'schema',
      bindingRevision: 1,
      event: occurrence,
      receivedAt: now,
      rawBody: Buffer.from(JSON.stringify(occurrence)),
    };
  };
  beforeEach(async () => {
    now = 100;
    directory = await mkdtemp(path.join(tmpdir(), 'mcp-worker-'));
    db = new PGlite(directory);
    await db.exec(
      MCP_EVENT_BINDING_SCHEMA_SQL + MCP_EVENT_INBOX_SCHEMA_SQL + MCP_EVENT_WORK_SCHEMA_SQL,
    );
    inbox = new SqlMcpEventInbox(db);
    bindings = new SqlMcpEventBindingRepository(db);
    repository = new SqlMcpEventWorkRepository(db);
    triggers = new SqlMcpEventTriggerRepository(db);
    await bindings.createPending(binding);
    await bindings.verifyPending('token', 'remote', 'challenge', 'challenge', now);
    await bindings.update(binding, binding.id, 'pending', { state: 'active' }, 0);
    expect(await triggers.save(trigger)).toBeDefined();
  });
  afterEach(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('does not rewind a cursor on duplicate receipt replay', async () => {
    const first = event('first');
    await inbox.accept(first);
    await inbox.accept(event('second'));
    expect(await inbox.accept(first)).toBe('duplicate');
    expect((await bindings.get(binding, binding.id))?.cursor).toBe('second');
  });

  it('filters before admission and isolates trigger scopes', async () => {
    await inbox.accept(event('ignored', 'other'));
    let calls = 0;
    const worker = new McpEventWorker({
      inbox,
      repository,
      now: () => now,
      admission: {
        async admit() {
          calls++;
          return { status: 'accepted', dispatchId: 'dispatch' };
        },
      },
    });
    expect(await worker.pump()).toEqual({ claimed: 1, completed: 1, retried: 0 });
    expect(calls).toBe(0);
    expect(await triggers.list({ ...trigger, tenantId: 'foreign' }, 'task')).toEqual([]);
    expect(await triggers.save({ ...trigger, userId: 'foreign' }, 0)).toBeUndefined();
    expect((await db.query('SELECT status FROM mcp_event_trigger_runs')).rows).toEqual([
      { status: 'filtered' },
    ]);
  });

  it('reuses durable trigger-run identity after admission commit but lost acknowledgement', async () => {
    await inbox.accept(event());
    const keys: string[] = [];
    let lost = true;
    const admission = {
      async admit(request: { idempotencyKey: string }) {
        keys.push(request.idempotencyKey);
        if (lost) {
          lost = false;
          throw new Error('committed but disconnected');
        }
        return { status: 'duplicate' as const, dispatchId: 'durable-dispatch' };
      },
    };
    expect(
      (await new McpEventWorker({ inbox, repository, admission, now: () => now }).pump()).retried,
    ).toBe(1);
    await db.close();
    db = new PGlite(directory);
    now += 3000;
    expect(
      (
        await new McpEventWorker({
          inbox: new SqlMcpEventInbox(db),
          repository: new SqlMcpEventWorkRepository(db),
          admission,
          now: () => now,
        }).pump()
      ).completed,
    ).toBe(1);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect((await db.query('SELECT status,dispatch_id FROM mcp_event_trigger_runs')).rows).toEqual([
      { status: 'accepted', dispatch_id: 'durable-dispatch' },
    ]);
  });

  it('fences stale workers and rejects changed trigger revision before admission', async () => {
    await inbox.accept(event());
    const [old] = await inbox.claim(now, 10);
    const [run] = await repository.prepare(old, now);
    now += 10;
    const [fresh] = await inbox.claim(now, 10);
    expect(await repository.current(old, run, now)).toBe(false);
    expect(
      await repository.settle(old, run, now, { status: 'accepted', dispatchId: 'stale' }),
    ).toBe(false);
    await triggers.save({ ...trigger, filters: [] }, 0);
    expect(await repository.current(fresh, run, now)).toBe(false);
  });

  it('holds unavailable admission without consuming receipt attempts', async () => {
    await inbox.accept(event());
    expect(
      (await new McpEventWorker({ inbox, repository, now: () => now, maxAttempts: 1 }).pump())
        .claimed,
    ).toBe(0);
    expect((await db.query('SELECT status,attempts FROM mcp_event_inbox')).rows).toEqual([
      { status: 'pending', attempts: 0 },
    ]);
  });

  it('retryable admission waits do not exhaust the transport failure budget', async () => {
    await inbox.accept(event());
    const worker = new McpEventWorker({
      inbox,
      repository,
      now: () => now,
      maxAttempts: 1,
      admission: {
        async admit() {
          return { status: 'waiting', retryable: true, reason: 'admission-held' };
        },
      },
    });
    await worker.pump();
    now += 3000;
    await worker.pump();
    expect((await db.query('SELECT status,attempts FROM mcp_event_inbox')).rows).toEqual([
      { status: 'pending', attempts: 0 },
    ]);
  });

  it('retains exhausted transport failures for operator recovery', async () => {
    await inbox.accept(event());
    await new McpEventWorker({
      inbox,
      repository,
      now: () => now,
      maxAttempts: 1,
      admission: {
        async admit() {
          throw new Error('transport disconnected');
        },
      },
    }).pump();
    expect((await db.query('SELECT status,last_error FROM mcp_event_inbox')).rows).toEqual([
      { status: 'dead', last_error: 'admission_interrupted' },
    ]);
    expect((await db.query('SELECT status FROM mcp_event_trigger_runs')).rows).toEqual([
      { status: 'pending' },
    ]);
  });

  it('never admits a binding revoked after the receipt', async () => {
    await inbox.accept(event());
    await bindings.revoke(binding, binding.id);
    let calls = 0;
    await new McpEventWorker({
      inbox,
      repository,
      now: () => now,
      admission: {
        async admit() {
          calls++;
          return { status: 'accepted', dispatchId: 'dispatch' };
        },
      },
    }).pump();
    expect(calls).toBe(0);
  });

  it('filters are exact and never follow inherited or prototype properties', () => {
    expect(
      matchesMcpEventFilters({ count: 1 }, [{ path: ['count'], operator: 'equals', value: '1' }]),
    ).toBe(false);
    expect(
      matchesMcpEventFilters({}, [{ path: ['constructor'], operator: 'contains', value: '' }]),
    ).toBe(false);
  });
});
