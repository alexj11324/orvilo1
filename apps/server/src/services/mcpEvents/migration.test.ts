// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

import { SqlMcpEventBindingRepository, SqlMcpEventInbox } from './inbox';

it('replays the shipped migration and commits receipts using its real unique indexes', async () => {
  const database = new PGlite();
  try {
    // Parent tables the consolidated migration references; their columns beyond
    // the FK targets are irrelevant to the event tables being exercised.
    await database.exec(`
      CREATE TABLE users (id text PRIMARY KEY);
      CREATE TABLE tasks (id text PRIMARY KEY);
      CREATE TABLE task_topics (id uuid PRIMARY KEY);
    `);
    const migration = await readFile(
      path.resolve('packages/database/migrations/0197_cloud_control_plane.sql'),
      'utf8',
    );
    const sql = migration.replaceAll('--> statement-breakpoint', ';');
    await database.exec(sql);
    await database.exec(sql);
    const bindings = new SqlMcpEventBindingRepository(database);
    const scope = { tenantId: 'tenant', connectorId: 'connector' };
    await bindings.createPending({
      ...scope,
      id: 'binding',
      revision: 0,
      callbackToken: 'callback',
      callbackUrl: 'https://receiver.example/callback',
      schemaId: 'schema',
      eventName: 'message',
      eventArguments: {},
      remoteSubscriptionId: null,
      state: 'pending',
      signingKeys: [],
      expiresAt: null,
      payloadSchema: {},
      cursor: null,
      truncated: false,
    });
    await bindings.verifyPending('callback', 'remote', 'verification', 'challenge', 1);
    await bindings.update(scope, 'binding', 'pending', { state: 'active' }, 0);
    const inbox = new SqlMcpEventInbox(database);
    const event = {
      eventId: 'event',
      name: 'message',
      timestamp: '2026-09-30T00:00:00Z',
      data: {},
      cursor: 'cursor',
    };
    const input = {
      ...scope,
      subscriptionId: 'binding',
      schemaId: 'schema',
      bindingRevision: 1,
      event,
      receivedAt: 2,
      rawBody: Buffer.from(JSON.stringify(event)),
    };
    expect(await inbox.accept(input)).toBe('accepted');
    expect(await inbox.accept(input)).toBe('duplicate');
    expect((await bindings.get(scope, 'binding'))?.cursor).toBe('cursor');
    expect(await database.query('SELECT id FROM mcp_event_inbox')).toMatchObject({
      rows: [{ id: expect.any(String) }],
    });
  } finally {
    await database.close();
  }
});
