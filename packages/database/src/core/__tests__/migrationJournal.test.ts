// @vitest-environment node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import type { SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { migrate as nodeMigrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as pgliteDrizzle } from 'drizzle-orm/pglite';
import { migrate as pgliteMigrate } from 'drizzle-orm/pglite/migrator';
import { Client, Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { assertTestDatabaseUrl } from '../../core/getTestDB';

/**
 * Drizzle's PG migrator selects pending entries by comparing the folder
 * journal `when` (folderMillis) against the max `created_at` already recorded
 * in `drizzle.__drizzle_migrations`. A journal whose `when` values are not
 * strictly increasing — e.g. a later migration recorded with an earlier
 * timestamp, as happened between 0179 and 0180 — makes a staged upgrade
 * silently skip entries: `0179` applies first, then the deploy carrying
 * `0180` sees `0180.when < max(created_at)` and never runs it, while the
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

  it('pins the 0179 → 0180 → 0181 boundary that shipped the journal-order bug', () => {
    const byTag = (prefix: string) => journal.entries.find((e) => e.tag.startsWith(prefix));
    const e178 = byTag('0179');
    const e179 = byTag('0180');
    const e180 = byTag('0181');
    const e181 = byTag('0182');
    expect(e178?.tag).toBe('0179_task_workspace_claims');
    expect(e179?.tag).toBe('0180_lean_metal_master');
    expect(e180?.tag).toBe('0181_task_dispatch_origin');
    expect(e181?.tag).toBe('0182_task_workspace_claim_identity');
    // Adjacency in journal order — nothing may interleave the repaired pair.
    expect(journal.entries.indexOf(e179!)).toBe(journal.entries.indexOf(e178!) + 1);
    expect(journal.entries.indexOf(e180!)).toBe(journal.entries.indexOf(e179!) + 1);
    expect(journal.entries.indexOf(e181!)).toBe(journal.entries.indexOf(e180!) + 1);
    // The exact regression: 0180 must sort strictly after 0179 on `when`.
    expect(e179!.when).toBeGreaterThan(e178!.when);
    expect(e180!.when).toBeGreaterThan(e179!.when);
    expect(e181!.when).toBeGreaterThan(e180!.when);
  });

  it('pins the 0180 → 0183 forward-repair pair for environments that skipped 0180', () => {
    const byTag = (prefix: string) => journal.entries.find((e) => e.tag.startsWith(prefix));
    const e179 = byTag('0180');
    const e181 = byTag('0182');
    const e182 = byTag('0183');
    // 0183 exists and carries the conditional repair — environments whose
    // recorded `created_at` already passed 0180's `when` converge through it.
    expect(e182?.tag).toBe('0183_fence_seq_forward_repair');
    expect(journal.entries.indexOf(e182!)).toBe(journal.entries.indexOf(e181!) + 1);
    expect(e182!.when).toBeGreaterThan(e181!.when);
    expect(e182!.when).toBeGreaterThan(e179!.when);
  });

  it('refuses a corrupted or dangling journal instead of silently skipping', () => {
    // A malformed journal must fail loudly at read time — a migrator that
    // silently tolerated it could skip entries the same way the ordering bug did.
    const broken = mkdtempSync(path.join(tmpdir(), 'orvilo-mig-broken-'));
    try {
      mkdirSync(path.join(broken, 'meta'));
      writeFileSync(path.join(broken, 'meta/_journal.json'), '{not json');
      expect(() => readMigrationFiles({ migrationsFolder: broken })).toThrow();
    } finally {
      rmSync(broken, { force: true, recursive: true });
    }

    const dangling = mkdtempSync(path.join(tmpdir(), 'orvilo-mig-dangling-'));
    try {
      mkdirSync(path.join(dangling, 'meta'));
      writeFileSync(
        path.join(dangling, 'meta/_journal.json'),
        JSON.stringify({
          entries: [{ breakpoints: true, idx: 0, tag: '0000_missing', version: '7', when: 1 }],
          version: '6',
        }),
      );
      expect(() => readMigrationFiles({ migrationsFolder: dangling })).toThrow(/No file/);
    } finally {
      rmSync(dangling, { force: true, recursive: true });
    }
  });
});

/**
 * Staged-upgrade replays on a real Postgres engine (PGlite). PGlite drives
 * the same `PgDialect.migrate` as node-postgres — same `created_at` selection
 * and the same single-transaction apply — so these tests exercise the actual
 * migrator against the real boundary SQL without needing DATABASE_TEST_URL.
 *
 * The scenarios replay the three field states `docs/development/
 * migration-journal-integrity.md` defines for 0180 (`fence_seq`):
 * never applied, applied under the old reversed journal, and skipped past.
 */
const realEntries = readJournal(migrationsFolder).entries;

const journalEntry = (prefix: string, when?: number): JournalEntry => {
  const real = realEntries.find((e) => e.tag.startsWith(prefix));
  if (!real) throw new Error(`No journal entry matches ${prefix}`);
  return { ...real, when: when ?? real.when };
};

const tailEntries = () => ['0179', '0180', '0181', '0182', '0183'].map((t) => journalEntry(t));

/** A temp migrations folder: real SQL files symlinked in, journal as given. */
const stageMigrationsFolder = (entries: JournalEntry[]): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'orvilo-mig-pglite-'));
  mkdirSync(path.join(dir, 'meta'));
  for (const file of readdirSync(migrationsFolder)) {
    if (file.endsWith('.sql')) symlinkSync(path.join(migrationsFolder, file), path.join(dir, file));
  }
  writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify({ entries, version: '6' }));
  return dir;
};

interface FenceSeqColumn {
  column_default: string | null;
  data_type: string;
  is_nullable: string;
}

describe('staged upgrade replay (PGlite)', () => {
  const runScenario = async (fn: (db: ReturnType<typeof pgliteDrizzle>) => Promise<void>) => {
    const client = new PGlite();
    const db = pgliteDrizzle({ client });
    // Minimal stand-ins for the tables the boundary cluster touches — the
    // real creators of these tables predate the journal segment under test.
    await db.execute(sql`CREATE TABLE "workspaces" ("id" text PRIMARY KEY)`);
    await db.execute(
      sql`CREATE TABLE "task_dispatches" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
    );
    await db.execute(
      sql`CREATE TABLE "integration_leases" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid())`,
    );
    try {
      await fn(db);
    } finally {
      await client.close();
    }
  };

  const fenceSeqColumn = async (db: ReturnType<typeof pgliteDrizzle>) => {
    const result = await db.execute(
      sql`SELECT data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'integration_leases'
            AND column_name = 'fence_seq'`,
    );
    return result.rows as unknown as FenceSeqColumn[];
  };

  const appliedMillis = async (db: ReturnType<typeof pgliteDrizzle>) => {
    const result = await db.execute(
      sql`SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at`,
    );
    return (result.rows as { created_at: number }[]).map((row) => Number(row.created_at));
  };

  const tail = tailEntries();
  const e178 = journalEntry('0179');
  const e179 = journalEntry('0180');
  const e180 = journalEntry('0181');
  const e181 = journalEntry('0182');
  const e182 = journalEntry('0183');

  it('M01: applies the boundary cluster in order — fence_seq arrives via 0180', async () => {
    await runScenario(async (db) => {
      // Deploy pinned at the 0179 boundary…
      await pgliteMigrate(db, {
        migrationsFolder: stageMigrationsFolder([e178]),
      });
      expect(await fenceSeqColumn(db)).toHaveLength(0);

      // …then the deploy carrying the tail — every entry lands in order.
      await pgliteMigrate(db, { migrationsFolder: stageMigrationsFolder(tail) });
      const cols = await fenceSeqColumn(db);
      expect(cols).toHaveLength(1);
      expect(cols[0]).toEqual({
        column_default: '0',
        data_type: 'bigint',
        is_nullable: 'NO',
      });
      expect(await appliedMillis(db)).toEqual([
        e178.when,
        e179.when,
        e180.when,
        e181.when,
        e182.when,
      ]);
    });
  }, 120_000);

  it('M02: repairs a database that skipped 0180 under the old reversed journal', async () => {
    await runScenario(async (db) => {
      await pgliteMigrate(db, {
        migrationsFolder: stageMigrationsFolder([e178]),
      });
      // Deploy window where 0180's `when` still preceded 0179's but
      // 0181/0182 were already present: both apply, 0180 is skipped forever.
      await pgliteMigrate(db, {
        migrationsFolder: stageMigrationsFolder([
          e178,
          journalEntry('0180', e178.when - 1),
          e180,
          e181,
        ]),
      });
      expect(await fenceSeqColumn(db)).toHaveLength(0);
      expect(await appliedMillis(db)).toEqual([e178.when, e180.when, e181.when]);

      // The repaired journal selects only 0183 — it adds the column 0180
      // can never reach on this database, with no duplicate and no gap.
      await pgliteMigrate(db, { migrationsFolder: stageMigrationsFolder(tail) });
      const cols = await fenceSeqColumn(db);
      expect(cols).toHaveLength(1);
      expect(cols[0]).toEqual({
        column_default: '0',
        data_type: 'bigint',
        is_nullable: 'NO',
      });
      expect(await appliedMillis(db)).toEqual([e178.when, e180.when, e181.when, e182.when]);
    });
  }, 120_000);

  it('M02: a database that applied 0180 under the reversed journal needs the documented marker repair', async () => {
    await runScenario(async (db) => {
      // Fresh apply under the pre-fix journal: every entry applies in order,
      // 0180 lands with its old (earlier-than-0179) timestamp.
      const old179When = e178.when - 1;
      await pgliteMigrate(db, {
        migrationsFolder: stageMigrationsFolder([e178, journalEntry('0180', old179When)]),
      });
      expect(await fenceSeqColumn(db)).toHaveLength(1);

      // The fixed journal re-selects 0180 (its new `when` exceeds the recorded
      // boundary) and crashes on the duplicate column before it can reach
      // 0183 — no in-band migration can rescue this environment, which is why
      // the integrity doc prescribes an explicit marker-row repair instead.
      await expect(
        pgliteMigrate(db, { migrationsFolder: stageMigrationsFolder(tail) }),
      ).rejects.toThrow();
      // The single-transaction apply rolled back — nothing was recorded.
      expect(await appliedMillis(db)).toEqual([old179When, e178.when]);

      // Documented repair: pin the already-applied 0180 row to its corrected
      // journal timestamp, matched by content hash — never a blind rewrite.
      const hash = createHash('sha256')
        .update(readFileSync(path.join(migrationsFolder, `${e179.tag}.sql`)))
        .digest('hex');
      await db.execute(
        sql`UPDATE "drizzle"."__drizzle_migrations"
            SET created_at = ${e179.when}
            WHERE hash = ${hash} AND created_at = ${old179When}`,
      );
      await pgliteMigrate(db, { migrationsFolder: stageMigrationsFolder(tail) });

      const cols = await fenceSeqColumn(db);
      expect(cols).toHaveLength(1);
      expect(cols[0].data_type).toBe('bigint');
      expect(await appliedMillis(db)).toEqual([
        e178.when,
        e179.when,
        e180.when,
        e181.when,
        e182.when,
      ]);
    });
  }, 120_000);

  it('0183 verifies the schema definition — a divergent column fails loudly', async () => {
    const repairSql = readFileSync(
      path.join(migrationsFolder, '0183_fence_seq_forward_repair.sql'),
      'utf8',
    );
    await runScenario(async (db) => {
      // A column with the right name but the wrong definition must not read
      // as "applied" — the repair migration refuses to mask the divergence.
      await db.execute(sql`ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" integer`);
      await expect(db.execute(sql.raw(repairSql))).rejects.toThrow(/diverges/);
    });
    await runScenario(async (db) => {
      await db.execute(
        sql`ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" bigint DEFAULT 0 NOT NULL`,
      );
      await expect(db.execute(sql.raw(repairSql))).resolves.toBeDefined();
      const cols = await fenceSeqColumn(db);
      expect(cols[0]).toEqual({
        column_default: '0',
        data_type: 'bigint',
        is_nullable: 'NO',
      });
    });
  }, 120_000);

  it.each<{ ddl: SQL; shape: string }>([
    // `column_default` is NULL for a defaulted-less column — `NULL <> '0'`
    // evaluates to NULL, so a null-unsafe comparison would silently pass.
    {
      ddl: sql`ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" bigint NOT NULL`,
      shape: 'no default',
    },
    {
      ddl: sql`ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" bigint DEFAULT 0`,
      shape: 'nullable',
    },
    {
      ddl: sql`ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" bigint DEFAULT 5 NOT NULL`,
      shape: 'wrong default',
    },
    {
      ddl: sql`ALTER TABLE "integration_leases" ADD COLUMN "fence_seq" integer DEFAULT 0 NOT NULL`,
      shape: 'wrong type',
    },
  ])(
    '0183 rejects a divergent fence_seq definition ($shape)',
    async ({ ddl }) => {
      const repairSql = readFileSync(
        path.join(migrationsFolder, '0183_fence_seq_forward_repair.sql'),
        'utf8',
      );
      await runScenario(async (db) => {
        await db.execute(ddl);
        await expect(db.execute(sql.raw(repairSql))).rejects.toThrow(/diverges/);
      });
    },
    120_000,
  );
});

const isServerDB = process.env.TEST_SERVER_DB === '1' && !!process.env.DATABASE_TEST_URL;

// Runs only under vitest.config.server.mts (TEST_SERVER_DB=1 + DATABASE_TEST_URL),
// i.e. the `test-database` CI job against a real paradedb image.
describe.skipIf(!isServerDB)('staged migration upgrade', () => {
  it('applies the tail migration after a boundary restart', async () => {
    const adminUrl = process.env.DATABASE_TEST_URL!;
    assertTestDatabaseUrl(adminUrl);

    const journal = readJournal(migrationsFolder);
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
