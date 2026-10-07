// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as nodeMigrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { serverDBEnv } from '@/config/db';

import { assertTestDatabaseUrl } from '../getTestDB';

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}
interface MigrationHarness {
  close: () => Promise<void>;
  migrate: (folder: string) => Promise<void>;
  query: (statement: string) => Promise<Record<string, unknown>[]>;
  restart: () => Promise<void>;
}

const migrationsFolder = path.join(__dirname, '../../../migrations');
const journal = JSON.parse(
  await readFile(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
) as { entries: JournalEntry[]; version: string };

const createHarness = async (postgres: boolean): Promise<MigrationHarness> => {
  if (!postgres) {
    const client = new PGlite({ extensions: { vector } });
    return {
      close: () => client.close(),
      migrate: (folder) => pgliteMigrate(pgliteDrizzle(client), { migrationsFolder: folder }),
      query: async (statement) => (await client.query<Record<string, unknown>>(statement)).rows,
      // Each pass constructs a new adapter, as a restarted migration runner does.
      restart: async () => {},
    };
  }

  // This branch runs only in GitHub CI's disposable PostgreSQL service.
  const connectionString = serverDBEnv.DATABASE_TEST_URL;
  if (!connectionString) throw new Error('DATABASE_TEST_URL is not set');
  assertTestDatabaseUrl(connectionString);
  const admin = new Pool({ connectionString });
  const name = `attention_migration_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  let client = new Pool({ connectionString: url.toString() });
  return {
    close: async () => {
      await client.end();
      try {
        await admin.query(`DROP DATABASE "${name}"`);
      } finally {
        await admin.end();
      }
    },
    migrate: (folder) => nodeMigrate(nodeDrizzle(client), { migrationsFolder: folder }),
    query: async (statement) => (await client.query(statement)).rows,
    restart: async () => {
      await client.end();
      client = new Pool({ connectionString: url.toString() });
    },
  };
};

const postgresCI = process.env.GITHUB_ACTIONS === 'true' && process.env.TEST_SERVER_DB === '1';

describe('task attention function forward migration', () => {
  it('installs from the staged journal and survives runner restart in PGlite', async () => {
    await verifyForwardMigration(false);
  }, 120_000);
  it.skipIf(!postgresCI)(
    'installs from the staged journal and survives reconnect in PostgreSQL CI',
    async () => {
      await verifyForwardMigration(true);
    },
    120_000,
  );
});

async function verifyForwardMigration(postgres: boolean) {
  const forward = journal.entries.find((entry) => entry.tag === '0206_task_unresolved_input');
  expect(forward).toBeDefined();
  expect(forward!.idx).toBe(206);
  const previous = journal.entries.filter((entry) => entry.idx < forward!.idx);
  expect(previous.at(-1)).toMatchObject({ idx: 205, when: 1791266080446 });
  expect(forward!.when).toBeGreaterThan(Math.max(...previous.map((entry) => entry.when)));

  const db = await createHarness(postgres);
  const folder = await mkdtemp(path.join(tmpdir(), 'orvilo-attention-migration-'));
  try {
    await mkdir(path.join(folder, 'meta'));
    for (const entry of [...previous, forward!]) {
      const source = await readFile(path.join(migrationsFolder, `${entry.tag}.sql`), 'utf8');
      // Match the existing PGlite runner: pg_search needs the CI server engine.
      const contents = !postgres && /pg_search|bm25/i.test(source) ? 'SELECT 1;' : source;
      await writeFile(path.join(folder, `${entry.tag}.sql`), contents);
    }
    const writeJournal = (entries: JournalEntry[]) =>
      writeFile(path.join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
    await writeJournal(previous);
    await db.migrate(folder);
    expect(
      await db.query(
        "SELECT to_regprocedure('has_task_unresolved_input(text,text)')::text AS name",
      ),
    ).toEqual([{ name: null }]);
    await db.query("INSERT INTO users (id) VALUES ('attention-migration-owner')");
    await db.query(`INSERT INTO tasks (id, identifier, seq, created_by_user_id, instruction)
      VALUES ('attention-migration-task', 'T-1', 1, 'attention-migration-owner', 'Preserve existing task')`);
    const triggers = await db.query(`SELECT tgname, pg_get_triggerdef(oid) AS definition
      FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname, definition`);

    await writeJournal([...previous, forward!]);
    await db.restart();
    await db.migrate(folder);
    await db.restart();
    await db.migrate(folder);
    expect(
      await db.query("SELECT has_task_unresolved_input('attention-migration-task') AS unresolved"),
    ).toEqual([{ unresolved: false }]);
    expect(
      await db.query("SELECT instruction FROM tasks WHERE id = 'attention-migration-task'"),
    ).toEqual([{ instruction: 'Preserve existing task' }]);
    expect(
      await db.query('SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations'),
    ).toEqual([{ count: previous.length + 1 }]);
    expect(
      await db.query(`SELECT tgname, pg_get_triggerdef(oid) AS definition
      FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname, definition`),
    ).toEqual(triggers);
  } finally {
    await db.close();
    await rm(folder, { force: true, recursive: true });
  }
}
