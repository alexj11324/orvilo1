// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { describe, expect, it } from 'vitest';

const migrationsFolder = path.join(__dirname, '../../../migrations');
const journal = JSON.parse(
  await readFile(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
);
const boundary = journal.entries.find(
  (entry: { tag: string }) => entry.tag === '0203_device_capability_snapshot',
);
const repair = journal.entries.find(
  (entry: { tag: string }) => entry.tag === '0204_automation_occurrences_forward_repair',
);

describe('automation occurrence forward migration', () => {
  it.each(['fresh', 'already migrated', 'already repaired'])(
    'creates required storage from the %s boundary and remains repeatable',
    async (state) => {
      const client = new PGlite();
      const db = drizzle(client);
      const folder = await mkdtemp(path.join(tmpdir(), 'orvilo-automation-migration-'));
      try {
        await client.exec(`
          CREATE TABLE users (id text PRIMARY KEY);
          CREATE TABLE workspaces (id text PRIMARY KEY);
          CREATE TABLE tasks (id text PRIMARY KEY);
          CREATE TABLE topics (id text PRIMARY KEY);
          CREATE TABLE devices (id text PRIMARY KEY);
          CREATE TABLE task_topics (id uuid PRIMARY KEY);
          CREATE TABLE task_dispatches (id uuid PRIMARY KEY);
          CREATE TABLE mcp_event_trigger_runs (id text PRIMARY KEY);
          INSERT INTO task_dispatches (id) VALUES ('00000000-0000-0000-0000-000000000001');
        `);
        await mkdir(path.join(folder, 'meta'));
        for (const entry of [boundary, repair]) {
          expect(entry).toBeDefined();
          await symlink(
            path.join(migrationsFolder, `${entry.tag}.sql`),
            path.join(folder, `${entry.tag}.sql`),
          );
        }
        if (state !== 'fresh') {
          await writeFile(
            path.join(folder, 'meta/_journal.json'),
            JSON.stringify({ entries: [boundary], version: '7' }),
          );
          await migrate(db, { migrationsFolder: folder });
        }
        if (state === 'already repaired') {
          await client.exec(
            await readFile(
              path.join(migrationsFolder, '0203_automation_occurrences_and_outputs.sql'),
              'utf8',
            ),
          );
        }
        await writeFile(
          path.join(folder, 'meta/_journal.json'),
          JSON.stringify({ entries: [boundary, repair], version: '7' }),
        );
        await migrate(db, { migrationsFolder: folder });
        await migrate(db, { migrationsFolder: folder });
        const columns = await client.query(`SELECT table_name, column_name
          FROM information_schema.columns WHERE table_schema = 'public' AND (
            (table_name = 'task_dispatches' AND column_name IN ('automation_occurrence', 'event_evidence')) OR
            (table_name = 'task_topics' AND column_name IN ('stop_reason', 'result_ready_at', 'result_outcome')) OR
            (table_name = 'mcp_event_trigger_runs' AND column_name = 'automation_occurrence')
          ) ORDER BY table_name, column_name`);
        expect(columns.rows).toHaveLength(6);
        expect(
          (await client.query(`SELECT to_regclass('automation_result_deliveries') AS name`)).rows,
        ).toEqual([{ name: 'automation_result_deliveries' }]);
        expect(
          (await client.query('SELECT count(*)::int AS count FROM task_dispatches')).rows,
        ).toEqual([{ count: 1 }]);
        expect(
          (await client.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations'))
            .rows,
        ).toEqual([{ count: 2 }]);
        expect(repair.when).toBeGreaterThan(
          Math.max(
            ...journal.entries
              .slice(0, journal.entries.indexOf(repair))
              .map((entry: { when: number }) => entry.when),
          ),
        );
      } finally {
        await client.close();
        await rm(folder, { force: true, recursive: true });
      }
    },
    120_000,
  );
});
