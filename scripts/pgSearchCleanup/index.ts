/**
 * pgSearchCleanup — remove leftover pg_search (ParadeDB) objects after the
 * Elasticsearch FTS cutover.
 *
 * Usage:
 *   tsx scripts/pgSearchCleanup/index.ts                # --status: read-only inventory (default)
 *   tsx scripts/pgSearchCleanup/index.ts --apply --yes  # actually drop the objects
 *
 * Env:
 *   DATABASE_URL         (required) target Postgres connection string; throws when unset
 *   FTS_SEARCH_PROVIDER  (required for --apply) must resolve to elasticsearch —
 *                        apply mode asserts the cutover already happened
 *
 * Guard rail: destructive DDL cleanup — read-only `--status` by default, and
 * `--apply` additionally requires the explicit `--yes` confirmation plus the
 * provider assertion (see scripts/README.md → Guard rails).
 *
 * Exit behavior: 0 on success; throws (non-zero) on unknown/conflicting flags,
 * missing DATABASE_URL, or a failed provider assertion.
 */
import pg from 'pg';

import { readPgSearchInventory } from './inventory';
import { assertElasticsearchCutover, runPgSearchCleanup } from './operations';
import { parsePgSearchCleanupOptions } from './options';

const { Client } = pg;

const run = async () => {
  const options = parsePgSearchCleanupOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  if (options.mode === 'apply') assertElasticsearchCutover(process.env.FTS_SEARCH_PROVIDER);

  const client = new Client({
    application_name: 'orvilo-pg-search-cleanup',
    connectionString: databaseUrl,
    connectionTimeoutMillis: 8000,
    statement_timeout: 600_000,
  });
  await client.connect();

  try {
    if (options.mode === 'status') {
      console.log(JSON.stringify(await readPgSearchInventory(client), null, 2));
      return;
    }

    console.log(JSON.stringify(await runPgSearchCleanup(client), null, 2));
  } finally {
    await client.end();
  }
};

void run().catch((error) => {
  console.error('pg_search cleanup failed:', error);
  process.exitCode = 1;
});
