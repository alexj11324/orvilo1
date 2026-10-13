// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../../migrations/0213_agent_device_binding_guard.sql'),
  'utf8',
);

describe('Agent device binding migration', () => {
  it('preserves legacy rows, rejects new invalid writes, derives real references, and replays twice', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE devices (id uuid PRIMARY KEY, device_id text, user_id text, workspace_id text, visibility text);
        CREATE TABLE agents (id text PRIMARY KEY, user_id text, workspace_id text, visibility text DEFAULT 'public', agency_config jsonb);
        INSERT INTO devices VALUES ('11111111-1111-4111-8111-111111111111', 'host', 'owner', NULL, 'private');
        INSERT INTO agents (id, user_id, agency_config) VALUES ('legacy-unbound', 'owner', NULL),
          ('legacy-bound', 'owner', '{"boundDeviceId":"host","executionTarget":"device"}');
      `);
      await db.exec(migration);
      await db.exec(migration);
      expect((await db.query('SELECT id FROM agents ORDER BY id')).rows).toEqual([
        { id: 'legacy-bound' },
        { id: 'legacy-unbound' },
      ]);
      await expect(
        db.exec("INSERT INTO agents (id, user_id) VALUES ('new-invalid', 'owner')"),
      ).rejects.toMatchObject({ code: '23514' });
      await db.exec("UPDATE agents SET agency_config = agency_config WHERE id = 'legacy-bound'");
      expect(
        (await db.query("SELECT bound_device_row_id FROM agents WHERE id = 'legacy-bound'")).rows,
      ).toEqual([{ bound_device_row_id: '11111111-1111-4111-8111-111111111111' }]);
      await expect(db.exec("DELETE FROM devices WHERE device_id = 'host'")).rejects.toMatchObject({
        code: '23503',
      });
    } finally {
      await db.close();
    }
  }, 30_000);
});
