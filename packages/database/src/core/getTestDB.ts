import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as nodeMigrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { Pool as NodePool } from 'pg';

import { serverDBEnv } from '@/config/db';

import * as schema from '../schemas';
import type { OrviloDatabase } from '../type';

const migrationsFolder = join(__dirname, '../../migrations');

const isServerDBMode = process.env.TEST_SERVER_DB === '1';

const LOCAL_TEST_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Server-mode tests run the full migration set and destructive fixtures
 * against `DATABASE_TEST_URL`. Refuse anything that is not a loopback or
 * docker-internal host unless explicitly overridden — a shared or
 * production URL must never be reachable from a test run (AC-41).
 */
export const assertTestDatabaseUrl = (connectionString: string) => {
  const hostname = new URL(connectionString).hostname;
  const isLocal =
    LOCAL_TEST_DB_HOSTS.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    // Single-label docker-compose service names (e.g. `postgres`, `db`).
    !hostname.includes('.');
  if (!isLocal && process.env.ALLOW_NONLOCAL_TEST_DB !== '1') {
    throw new Error(
      `Refusing to run tests against non-local database host "${hostname}". ` +
        'Point DATABASE_TEST_URL at a disposable local database, or set ALLOW_NONLOCAL_TEST_DB=1 to override.',
    );
  }
};

let testClientDB: ReturnType<typeof pgliteDrizzle<typeof schema>> | null = null;
let testServerDB: ReturnType<typeof nodeDrizzle<typeof schema>> | null = null;

export const getTestDB = async (): Promise<OrviloDatabase> => {
  // Server DB mode (node-postgres)
  if (isServerDBMode) {
    if (testServerDB) return testServerDB as unknown as OrviloDatabase;

    const connectionString = serverDBEnv.DATABASE_TEST_URL;

    if (!connectionString) {
      throw new Error('DATABASE_TEST_URL is not set');
    }

    assertTestDatabaseUrl(connectionString);

    const client = new NodePool({ connectionString });
    testServerDB = nodeDrizzle(client, { schema });

    await nodeMigrate(testServerDB, { migrationsFolder });

    return testServerDB as unknown as OrviloDatabase;
  }

  // Client DB mode (PGlite)
  if (testClientDB) return testClientDB as unknown as OrviloDatabase;

  const pglite = new PGlite({ extensions: { vector } });
  testClientDB = pgliteDrizzle({ client: pglite, schema });

  // Custom migration that skips pg_search-related SQL for PGlite compatibility
  const migrations = readMigrationFiles({ migrationsFolder });

  await testClientDB.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await testClientDB.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  for (const migration of migrations) {
    const skipSql = migration.sql.some(
      (s) => s.toLowerCase().includes('pg_search') || s.toLowerCase().includes('bm25'),
    );

    if (!skipSql) {
      for (const stmt of migration.sql) {
        await testClientDB.execute(sql.raw(stmt));
      }
    }

    await testClientDB.execute(
      sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`,
    );
  }

  return testClientDB as unknown as OrviloDatabase;
};
