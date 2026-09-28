/**
 * migrateServerDB — apply all pending Drizzle migrations to the server database.
 *
 * Purpose: bootstrap/update a Postgres database to the current schema. Safe to
 *   re-run — Drizzle's migrator only applies migrations newer than the last
 *   recorded journal entry, so this is intentionally run in CI/bootstrap with
 *   no additional guard (see scripts/README.md → Guard rails).
 *
 * Usage:
 *   bun run db:migrate          # package script: cross-env MIGRATION_DB=1 tsx ./scripts/migrateServerDB/index.ts
 *
 * Env:
 *   DATABASE_URL      (required)  target Postgres connection string; the script
 *                                 exits 0 without migrating when it is unset
 *   DATABASE_DRIVER   (optional)  'node' uses node-postgres; otherwise neon-serverless
 *   NODE_ENV          (optional)  selects layered .env.[env] / .env.[env].local files
 *
 * Exit behavior: 0 on success (or when DATABASE_URL is unset), 1 on migration failure.
 */
import path from 'node:path';

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { migrate as neonMigrate } from 'drizzle-orm/neon-serverless/migrator';
import { migrate as nodeMigrate } from 'drizzle-orm/node-postgres/migrator';

// @ts-ignore tsgo handle esm import cjs and compatibility issues
import { DB_FAIL_INIT_HINT, DUPLICATE_EMAIL_HINT, PGVECTOR_HINT } from './errorHint';
import { runWithLockRetry } from './retry';

// Load environment variables in priority order:
// 1. .env (lowest priority)
// 2. .env.[env] (medium priority, overrides .env)
// 3. .env.[env].local (highest priority, overrides previous)
// Use dotenv-expand to support ${var} variable expansion
const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config()); // Load .env
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` })); // Load .env.[env] and override
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` })); // Load .env.[env].local and override

const migrationsFolder = path.join(__dirname, '../../packages/database/migrations');

const runMigrations = async () => {
  const { serverDB } = await import('../../packages/database/src/server');

  const time = Date.now();
  await runWithLockRetry(async () => {
    if (process.env.DATABASE_DRIVER === 'node') {
      await nodeMigrate(serverDB, { migrationsFolder });
    } else {
      await neonMigrate(serverDB, { migrationsFolder });
    }
  });

  console.log('✅ database migration pass. use: %s ms', Date.now() - time);

  process.exit(0);
};

const connectionString = process.env.DATABASE_URL;

// only migrate database if the connection string is available
if (connectionString) {
  runMigrations().catch((err) => {
    console.error('❌ Database migrate failed:', err);

    const errMsg = err.message as string;

    const constraint = (err as { constraint?: string })?.constraint;

    if (errMsg.includes('extension "vector" is not available')) {
      console.info(PGVECTOR_HINT);
    } else if (constraint === 'users_email_unique' || errMsg.includes('users_email_unique')) {
      console.info(DUPLICATE_EMAIL_HINT);
    } else if (errMsg.includes(`Cannot read properties of undefined (reading 'migrate')`)) {
      console.info(DB_FAIL_INIT_HINT);
    }

    process.exit(1);
  });
} else {
  console.log('🟢 not find database env or in desktop mode, migration skipped');
}
