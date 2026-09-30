// @vitest-environment node
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterAll, describe, expect, it } from 'vitest';

const migrations = readMigrationFiles({
  migrationsFolder: path.join(__dirname, '../../../migrations'),
});
const db = new PGlite({ extensions: { vector } });

const apply = async (entries: typeof migrations) => {
  for (const migration of entries) {
    if (migration.sql.some((statement) => /pg_search|bm25/i.test(statement))) continue;
    for (const statement of migration.sql) await db.exec(statement);
  }
};

describe('core execution authority migration', () => {
  afterAll(async () => {
    await db.close();
  });

  it('creates receipt, snapshot, and handoff storage and replays', async () => {
    const core = migrations.find(
      (migration) =>
        migration.folderMillis > 0 &&
        migration.sql.some((statement) => statement.includes('action_receipts')),
    );
    expect(core).toBeTruthy();
    await apply(migrations);
    await apply([core!]);
    const tables = await db.query(`SELECT to_regclass('action_receipts') AS receipts,
      to_regclass('core_session_snapshots') AS snapshots,
      to_regclass('task_execution_handoffs') AS handoffs`);
    expect(tables.rows).toEqual([
      {
        receipts: 'action_receipts',
        snapshots: 'core_session_snapshots',
        handoffs: 'task_execution_handoffs',
      },
    ]);
    const columns = await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_name = 'task_topics' AND column_name IN ('execution_control', 'execution_control_revision')
      ORDER BY column_name`);
    expect(columns.rows).toEqual([
      { column_name: 'execution_control' },
      { column_name: 'execution_control_revision' },
    ]);
    await db.exec(`INSERT INTO action_receipts (id, reservation_key, owner_token, receipt)
      VALUES ('receipt', 'reservation', 'owner', '{}'::jsonb)`);
    await expect(
      db.exec(`INSERT INTO action_receipts (id, reservation_key, owner_token, receipt)
        VALUES ('other', 'reservation', 'owner', '{}'::jsonb)`),
    ).rejects.toThrow();
  }, 120_000);
});
