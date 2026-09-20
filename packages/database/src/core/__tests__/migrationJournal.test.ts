// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as nodeMigrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { assertTestDatabaseUrl } from '../../core/getTestDB';

/**
 * Drizzle's PG migrator selects pending entries by comparing the folder
 * journal `when` (folderMillis) against the max `created_at` already recorded
 * in `drizzle.__drizzle_migrations`. A journal whose `when` values are not
 * strictly increasing — e.g. a later migration recorded with an earlier
 * timestamp, as happened between 0178 and 0179 — makes a staged upgrade
 * silently skip entries: `0178` applies first, then the deploy carrying
 * `0179` sees `0179.when < max(created_at)` and never runs it, while the
 * code starts reading `integration_leases.fence_seq`.
 *
 * These tests pin both halves of that contract: the journal is monotone at
 * author time, and a real two-stage apply (old boundary → restart → new
 * boundary) actually lands the tail migration.
 */

const migrationsFolder = path.join(__dirname, '../../../migrations');

interface JournalEntry {
  breakpoints: boolean;
  idx: number;
  tag: string;
  version: string;
  when: number;
}

interface Journal {
  entries: JournalEntry[];
}

const readJournal = (folder: string): Journal =>
  JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8'));

describe('migration journal integrity', () => {
  const journal = readJournal(migrationsFolder);

  it('keeps idx strictly increasing and gap-free', () => {
    journal.entries.forEach((entry, i) => {
      if (i === 0) return;
      const prev = journal.entries[i - 1];
      expect(entry.idx, `entry ${entry.tag} idx`).toBe(prev.idx + 1);
    });
  });

  it('keeps `when` strictly increasing so staged upgrades never skip an entry', () => {
    journal.entries.forEach((entry, i) => {
      if (i === 0) return;
      const prev = journal.entries[i - 1];
      expect(
        entry.when,
        `${entry.tag} (${entry.when}) must sort after ${prev.tag} (${prev.when}); ` +
          'a non-increasing timestamp makes the drizzle migrator skip this migration ' +
          'on databases that already applied the previous entry',
      ).toBeGreaterThan(prev.when);
    });
  });

  it('has a sql file and snapshot for every journal entry', () => {
    for (const entry of journal.entries) {
      expect(existsSync(path.join(migrationsFolder, `${entry.tag}.sql`)), entry.tag).toBe(true);
      const idxPrefix = String(entry.idx).padStart(4, '0');
      expect(
        existsSync(path.join(migrationsFolder, `meta/${idxPrefix}_snapshot.json`)),
        `${entry.tag} snapshot`,
      ).toBe(true);
    }
  });
});

const isServerDB = process.env.TEST_SERVER_DB === '1' && !!process.env.DATABASE_TEST_URL;

// Runs only under vitest.config.server.mts (TEST_SERVER_DB=1 + DATABASE_TEST_URL),
// i.e. the `test-database` CI job against a real paradedb image.
describe.skipIf(!isServerDB)('staged migration upgrade', () => {
  it('applies the tail migration after a boundary restart', async () => {
    const adminUrl = process.env.DATABASE_TEST_URL!;
    assertTestDatabaseUrl(adminUrl);

    const journal = readJournal(migrationsFolder);
    const last = journal.entries.at(-1)!;
    const boundary = journal.entries.at(-2)!;

    // Scratch database so the real migrator runs against a clean slate.
    const scratchName = `orvilo_mig_stage_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
    await admin.query(`CREATE DATABASE "${scratchName}"`);

    const scratchUrl = new URL(adminUrl);
    scratchUrl.pathname = `/${scratchName}`;

    const pool = new Pool({ connectionString: scratchUrl.toString() });
    const db = nodeDrizzle(pool);

    // Stage A: journal truncated at the previous boundary — the on-disk folder
    // an old deploy would have seen. SQL/snapshot files are symlinked into a
    // temp dir so the full journal copy is unnecessary.
    const stageDir = mkdtempSync(path.join(tmpdir(), 'orvilo-mig-stage-'));
    mkdirSync(path.join(stageDir, 'meta'));
    for (const file of readdirSync(migrationsFolder)) {
      if (file.endsWith('.sql'))
        symlinkSync(path.join(migrationsFolder, file), path.join(stageDir, file));
    }
    for (const file of readdirSync(path.join(migrationsFolder, 'meta'))) {
      if (file.endsWith('_snapshot.json'))
        symlinkSync(path.join(migrationsFolder, 'meta', file), path.join(stageDir, 'meta', file));
    }
    writeFileSync(
      path.join(stageDir, 'meta/_journal.json'),
      JSON.stringify({ entries: journal.entries.slice(0, -1), version: '6' }, null, 2),
    );

    try {
      await nodeMigrate(db, { migrationsFolder: stageDir });

      const applied = await pool.query<{ created_at: string }>(
        'SELECT MAX(created_at) AS created_at FROM "drizzle"."__drizzle_migrations"',
      );
      expect(Number(applied.rows[0]?.created_at)).toBe(boundary.when);

      // Stage B: real folder — the deploy carrying the tail migration.
      await nodeMigrate(db, { migrationsFolder });

      const appliedAfter = await pool.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM "drizzle"."__drizzle_migrations"',
      );
      expect(Number(appliedAfter.rows[0]?.count)).toBe(journal.entries.length);

      // The tail migration is the one staged upgrades used to lose.
      const col = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'integration_leases' AND column_name = 'fence_seq'`,
      );
      expect(col.rows).toHaveLength(1);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS "${scratchName}"`);
      await admin.end();
    }
  }, 300_000);
});
