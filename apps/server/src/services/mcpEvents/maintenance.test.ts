// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { McpEventsAdapter } from './adapter';
import type { McpEventBinding } from './deliveryTypes';
import { MCP_EVENT_BINDING_SCHEMA_SQL, SqlMcpEventBindingRepository } from './inbox';
import { renewMcpEventSubscriptions } from './maintenance';
import { MCP_EVENTS_METHODS } from './protocol';

// Provider transport is the boundary fixture; subscription and SQL logic are real.
describe('MCP subscription watchdog renewal', () => {
  let database: PGlite;
  let repository: SqlMcpEventBindingRepository;
  let providerCalls: number;
  const now = Date.parse('2026-09-30T12:00:00Z');
  let clock = now;
  const binding: McpEventBinding = {
    callbackToken: 'callback',
    callbackUrl: 'https://receiver.example/events/callback',
    connectorId: '00000000-0000-4000-8000-0000000000c1',
    cursor: null,
    eventArguments: {},
    eventName: 'message',
    expiresAt: now + 30_000,
    id: 'binding',
    payloadSchema: { type: 'object' },
    remoteSubscriptionId: null,
    revision: 0,
    schemaId: 'message-v1',
    signingKeys: [{ secret: `whsec_${Buffer.alloc(32, 5).toString('base64')}` }],
    state: 'pending',
    tenantId: 'workspace',
    truncated: false,
  };
  const renew = () =>
    renewMcpEventSubscriptions({
      database,
      now: () => clock,
      adapterFor: async (_binding, scope) => {
        expect(scope).toEqual({ userId: 'user', workspaceId: 'workspace' });
        return new McpEventsAdapter({
          request: async (method) => {
            providerCalls++;
            expect(method).toBe(MCP_EVENTS_METHODS.subscribe);
            return {
              cursor: 'new-cursor',
              id: 'remote',
              refreshBefore: new Date(clock + 600_000).toISOString(),
              truncated: false,
            };
          },
        });
      },
    });
  beforeEach(async () => {
    providerCalls = 0;
    clock = now;
    database = new PGlite();
    await database.exec(
      MCP_EVENT_BINDING_SCHEMA_SQL +
        `
      CREATE TABLE mcp_event_triggers (tenant_id text,workspace_id text,user_id text,task_id text,subscription_id text,source_id text);
      CREATE TABLE tasks (id text,workspace_id text,created_by_user_id text);
      CREATE TABLE workspace_members (workspace_id text,user_id text,role text,deleted_at bigint,suspended_at bigint);
      -- Real schema types: user_connectors.id is uuid, source_id stays text —
      -- the scope query must join across the type boundary.
      CREATE TABLE user_connectors (id uuid,workspace_id text,user_id text,is_enabled boolean,status text,agent_id text);
      INSERT INTO mcp_event_triggers VALUES ('workspace','workspace','user','task','binding','00000000-0000-4000-8000-0000000000c1');
      INSERT INTO tasks VALUES ('task','workspace','user');
      INSERT INTO workspace_members VALUES ('workspace','user','member',NULL,NULL);
      INSERT INTO user_connectors VALUES ('00000000-0000-4000-8000-0000000000c1','workspace','user',true,'connected',NULL);
    `,
    );
    repository = new SqlMcpEventBindingRepository(database);
    await repository.createPending(binding);
    await repository.verifyPending('callback', 'remote', 'challenge', 'fresh-challenge', now);
    await repository.update(binding, binding.id, 'pending', { state: 'active' }, 0);
  });
  afterEach(async () => {
    await database.close();
  });

  it('renews through the subscription service and persists the returned grant', async () => {
    expect(await renew()).toEqual([{ id: 'binding', status: 'refreshed' }]);
    expect(providerCalls).toBe(1);
    expect(await repository.get(binding, binding.id)).toMatchObject({
      state: 'active',
      cursor: 'new-cursor',
      expiresAt: now + 600_000,
    });
    expect(await renew()).toEqual([]);
  });

  it('renews a deadline between watchdog ticks before it can lapse', async () => {
    await repository.update(binding, binding.id, 'active', { expiresAt: now + 120_000 }, 1);
    // At 12:00 the old 60s lead misses a 12:02 deadline; the next tick is 12:05.
    expect(await renew()).toEqual([{ id: 'binding', status: 'refreshed' }]);
    clock = now + 5 * 60_000;
    expect((await repository.get(binding, binding.id))!.expiresAt).toBeGreaterThan(clock);
    expect(await renew()).toEqual([{ id: 'binding', status: 'refreshed' }]);
    expect((await repository.get(binding, binding.id))!.expiresAt).toBe(clock + 600_000);
  });

  it('bounds renewal concurrency to four while draining the selected batch', async () => {
    for (let index = 1; index <= 5; index++) {
      const copy = { ...binding, id: `binding-${index}`, callbackToken: `callback-${index}` };
      await repository.createPending(copy);
      await repository.verifyPending(
        copy.callbackToken,
        `remote-${index}`,
        `challenge-${index}`,
        'challenge',
        now,
      );
      await repository.update(copy, copy.id, 'pending', { state: 'active' }, 0);
      await database.query(
        `INSERT INTO mcp_event_triggers VALUES ('workspace','workspace','user','task',$1,'00000000-0000-4000-8000-0000000000c1')`,
        [copy.id],
      );
    }
    let active = 0;
    let peak = 0;
    let calls = 0;
    let release!: () => void;
    let saturated!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fourStarted = new Promise<void>((resolve) => {
      saturated = resolve;
    });
    const renewing = renewMcpEventSubscriptions({
      database,
      now: () => now,
      adapterFor: async (current) =>
        new McpEventsAdapter({
          request: async () => {
            active++;
            calls++;
            peak = Math.max(peak, active);
            if (active === 4) saturated();
            await gate;
            active--;
            return {
              id: current.remoteSubscriptionId,
              cursor: null,
              refreshBefore: new Date(now + 600_000).toISOString(),
              truncated: false,
            };
          },
        }),
    });
    await fourStarted;
    expect(calls).toBe(4);
    release();
    expect(await renewing).toHaveLength(6);
    expect(calls).toBe(6);
    expect(peak).toBe(4);
  });

  it.each([
    'UPDATE workspace_members SET suspended_at=1',
    'UPDATE workspace_members SET deleted_at=1',
    "UPDATE workspace_members SET role='guest'",
    'UPDATE user_connectors SET is_enabled=false',
    "UPDATE user_connectors SET workspace_id='foreign'",
    "UPDATE tasks SET created_by_user_id='foreign'",
    'DELETE FROM mcp_event_triggers',
  ])('revokes without provider IO when saved authority is no longer valid: %s', async (change) => {
    await database.exec(change);
    expect(await renew()).toEqual([{ id: 'binding', status: 'revoked' }]);
    expect(providerCalls).toBe(0);
    expect((await repository.get(binding, binding.id))?.state).toBe('revoked');
  });
});
