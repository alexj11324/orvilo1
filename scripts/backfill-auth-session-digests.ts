/**
 * Hash every legacy auth_sessions bearer without deleting rows or inventing a Clerk SID.
 * Run after the auth-only prerequisite and before serving the digest-only candidate.
 * DATABASE_URL must be supplied explicitly; no .env/default profile is loaded.
 * Usage: bun scripts/backfill-auth-session-digests.ts [--apply]
 * Dry run by default. Output contains counts only, never tokens or connection strings.
 */
import { pathToFileURL } from 'node:url';

import pg from 'pg';

import { backfillAuthSessionDigests } from './migrateServerDB/backfillAuthSessionDigests';

export { backfillAuthSessionDigests };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  if (process.argv.slice(2).some((arg) => arg !== '--apply'))
    throw new Error('Only --apply is supported');
  const pool = new pg.Pool({ connectionString });
  try {
    console.info(await backfillAuthSessionDigests(pool, process.argv.includes('--apply')));
  } catch {
    console.error('Auth session digest backfill failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
