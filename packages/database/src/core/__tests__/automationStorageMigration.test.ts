// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { expect, it } from 'vitest';

const folder = path.join(__dirname, '../../../migrations');
const journal = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8'));
const migrations = readMigrationFiles({ migrationsFolder: folder });

it.each(['fresh', 'upgrade'])(
  'registers automation storage through normal %s migration replay',
  async (mode) => {
    const client = new PGlite({ extensions: { vector } });
    const db = drizzle(client);
    const stage = mkdtempSync(path.join(tmpdir(), 'orvilo-automation-migration-'));
    mkdirSync(path.join(stage, 'meta'));
    // PGlite lacks pg_search; use the same compatibility exclusion as getTestDB.
    const entries = journal.entries.filter(
      (_: unknown, index: number) =>
        !migrations[index].sql.some((statement) => /pg_search|bm25/i.test(statement)),
    );
    for (const entry of entries)
      symlinkSync(path.join(folder, `${entry.tag}.sql`), path.join(stage, `${entry.tag}.sql`));
    const setEntries = (selected: typeof entries) =>
      writeFileSync(
        path.join(stage, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: selected }),
      );
    try {
      if (mode === 'upgrade') {
        // Existing deployments at 0203 must select the new registration by timestamp.
        setEntries(
          entries.filter(
            (entry: { idx: number; tag: string }) =>
              entry.idx <= 203 &&
              !['0198_mcp_events', '0199_core_execution_authority'].includes(entry.tag),
          ),
        );
        await migrate(db, { migrationsFolder: stage });
        await client.exec(`INSERT INTO users (id) VALUES ('preserved-user')`);
        await client.exec(`INSERT INTO mcp_event_bindings (id, tenant_id, connector_id, callback_token, state, binding)
        VALUES ('binding', 'tenant', 'connector', 'token', 'active', '{}')`);
      }
      setEntries(entries);
      await migrate(db, { migrationsFolder: stage });
      await client.query(
        `SELECT automation_occurrence, event_evidence FROM task_dispatches LIMIT 0`,
      );
      await client.query(`SELECT automation_occurrence FROM mcp_event_trigger_runs LIMIT 0`);
      await client.query(
        `SELECT stop_reason, result_ready_at, result_outcome FROM task_topics LIMIT 0`,
      );
      await client.query(`SELECT payload, operation_id FROM automation_result_deliveries LIMIT 0`);
      if (mode === 'fresh')
        await client.exec(`INSERT INTO mcp_event_bindings (id, tenant_id, connector_id, callback_token, state, binding)
      VALUES ('binding', 'tenant', 'connector', 'token', 'active', '{}')`);
      // Replay remains a no-op and retains both historical and newly written records.
      await migrate(db, { migrationsFolder: stage });
      expect((await client.query(`SELECT id FROM mcp_event_bindings`)).rows).toEqual([
        { id: 'binding' },
      ]);
      if (mode === 'upgrade')
        expect(
          (await client.query(`SELECT id FROM users WHERE id = 'preserved-user'`)).rows,
        ).toEqual([{ id: 'preserved-user' }]);
    } finally {
      await client.close();
      rmSync(stage, { recursive: true, force: true });
    }
  },
  120_000,
);
