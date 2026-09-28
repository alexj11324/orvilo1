import { isIP } from 'node:net';
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

const LOCAL_TEST_DB_HOSTS = new Set(['localhost']);
const LOCAL_TEST_DB_SUFFIXES = ['.internal', '.local'];
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1']);

/**
 * Strip URL brackets from an IPv6 literal and unwrap IPv4-mapped forms so
 * `::ffff:127.0.0.1` is judged as the embedded IPv4 address. A trailing root
 * dot is a name quirk, not a different host.
 */
const normalizeTestDbHost = (hostname: string): string => {
  const unbracketed =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const undotted = unbracketed.endsWith('.') ? unbracketed.slice(0, -1) : unbracketed;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(undotted);
  if (mapped) return mapped[1];
  // WHATWG URL serializes IPv4-mapped IPv6 as hex — `::ffff:7f00:1` is
  // `127.0.0.1`, so decode the embedded address before IP classification.
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(undotted);
  if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1], 16);
    const lo = Number.parseInt(mappedHex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return undotted;
};

/**
 * Server-mode tests run the full migration set and destructive fixtures
 * against `DATABASE_TEST_URL`. Refuse anything that is not a loopback or
 * docker-internal host unless explicitly overridden — a shared or
 * production URL must never be reachable from a test run (AC-41).
 *
 * IP literals are classified as IPs, never as names: only exact loopback
 * passes, so remote IPv6 (or private/link-local) addresses cannot slip
 * through the single-label hostname rule — their string form has no dot.
 */
export const assertTestDatabaseUrl = (connectionString: string) => {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Refusing to run tests: DATABASE_TEST_URL is not a parseable URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      `Refusing to run tests against a non-PostgreSQL URL (protocol "${url.protocol}")`,
    );
  }

  const hostname = normalizeTestDbHost(url.hostname);
  const isLocal =
    isIP(hostname) !== 0
      ? LOOPBACK_IPS.has(hostname)
      : LOCAL_TEST_DB_HOSTS.has(hostname) ||
        LOCAL_TEST_DB_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
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
