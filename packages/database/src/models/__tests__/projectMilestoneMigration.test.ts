// @vitest-environment node
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, expect, it } from 'vitest';

const migration = readMigrationFiles({
  migrationsFolder: path.join(__dirname, '../../../migrations'),
}).find((item) => item.sql.some((statement) => statement.includes('"project_milestone_id"')));

if (!migration) throw new Error('Task project milestone migration not found');

const migrationSql = migration.sql.join('\n');

/**
 * The migration's inverse, in reverse order. Drizzle migrations are
 * forward-only in this repo (the journal integrity test refuses a folder
 * holding an .sql file with no journal entry), so the rollback path has no
 * file of its own — it lives here, next to the test that proves it runs.
 *
 * Dropping the column is a real rollback of the *schema*, and it discards the
 * milestone↔task links with it. There is nothing to preserve: this migration
 * introduced the column, so before it no row could hold a link.
 */
const inverseSql = [
  'DROP INDEX IF EXISTS "tasks_project_milestone_id_idx"',
  'ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_milestone_id_project_milestones_id_fk"',
  'ALTER TABLE "tasks" DROP COLUMN IF EXISTS "project_milestone_id"',
];

const MILESTONE_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Only the parent tables the consolidated migration's foreign keys reference.
 * The milestone DDL now lives inside `0189_linear_parity_project_layering`,
 * which creates `project_milestones` itself (with the columns its indexes
 * need) but expects `users`, `workspaces`, `projects`, and
 * `tasks.duplicate_of_task_id` to already exist — stub them minimally so the
 * test still replays the real file end to end.
 */
const setupDependencies = async (client: PGlite) => {
  await client.exec(`
    CREATE TABLE "users" ("id" text PRIMARY KEY NOT NULL);
    CREATE TABLE "workspaces" ("id" text PRIMARY KEY NOT NULL);
    CREATE TABLE "projects" ("id" text PRIMARY KEY NOT NULL);
    CREATE TABLE "tasks" (
      "id" text PRIMARY KEY NOT NULL,
      "project_id" text,
      "duplicate_of_task_id" text
    );
  `);
};

const applyMigration = async (client: PGlite) => {
  for (const statement of migration.sql) await client.exec(statement);
};

const applyInverse = async (client: PGlite) => {
  for (const statement of inverseSql) await client.exec(statement);
};

const columnNames = async (client: PGlite) => {
  const { rows } = await client.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks'
  `);
  return rows.map(({ column_name }) => column_name);
};

const linkConstraint = async (client: PGlite) => {
  const { rows } = await client.query<{ confdeltype: string; conname: string }>(`
    SELECT conname, confdeltype FROM pg_constraint
    WHERE conname = 'tasks_project_milestone_id_project_milestones_id_fk'
  `);
  return rows[0] ?? null;
};

const linkIndex = async (client: PGlite) => {
  const { rows } = await client.query<{ indexname: string }>(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'tasks'
      AND indexname = 'tasks_project_milestone_id_idx'
  `);
  return rows[0]?.indexname ?? null;
};

describe('project milestone link migration', () => {
  it('adds the link with retry-safe DDL', () => {
    expect(migrationSql).toContain(
      'ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "project_milestone_id" uuid',
    );
    expect(migrationSql).toContain(
      'DROP CONSTRAINT IF EXISTS "tasks_project_milestone_id_project_milestones_id_fk"',
    );
    expect(migrationSql).toContain('CREATE INDEX IF NOT EXISTS "tasks_project_milestone_id_idx"');
    // Nullable: existing tasks have no milestone, and the column above must not
    // turn them into invalid rows.
    expect(migrationSql).not.toContain('"project_milestone_id" uuid NOT NULL');
  });

  it('lands the column, index and SET NULL foreign key on a real engine', async () => {
    const client = new PGlite();
    try {
      await setupDependencies(client);
      await applyMigration(client);

      expect(await columnNames(client)).toContain('project_milestone_id');
      expect(await linkIndex(client)).toBe('tasks_project_milestone_id_idx');
      // 'n' is PostgreSQL's ON DELETE SET NULL.
      expect(await linkConstraint(client)).toEqual({
        confdeltype: 'n',
        conname: 'tasks_project_milestone_id_project_milestones_id_fk',
      });
    } finally {
      await client.close();
    }
  });

  it('keeps the work when its milestone is deleted', async () => {
    const client = new PGlite();
    try {
      await setupDependencies(client);
      await applyMigration(client);
      await client.exec(`
        INSERT INTO "projects" ("id") VALUES ('p1');
        INSERT INTO "project_milestones" ("id", "project_id") VALUES ('${MILESTONE_ID}', 'p1');
        INSERT INTO "tasks" ("id", "project_id", "project_milestone_id")
          VALUES ('t1', 'p1', '${MILESTONE_ID}');
      `);

      await client.exec(`DELETE FROM "project_milestones" WHERE "id" = '${MILESTONE_ID}'`);

      const { rows } = await client.query<{ id: string; project_milestone_id: string | null }>(
        `SELECT "id", "project_milestone_id" FROM "tasks"`,
      );
      expect(rows).toEqual([{ id: 't1', project_milestone_id: null }]);
    } finally {
      await client.close();
    }
  });

  it('replays forward twice without failing', async () => {
    const client = new PGlite();
    try {
      await setupDependencies(client);
      await applyMigration(client);
      await applyMigration(client);

      expect(await columnNames(client)).toContain('project_milestone_id');
      expect(await linkIndex(client)).toBe('tasks_project_milestone_id_idx');
    } finally {
      await client.close();
    }
  });

  it('reverses to the pre-migration table shape and can be re-applied', async () => {
    const client = new PGlite();
    try {
      await setupDependencies(client);
      await applyMigration(client);
      await client.exec(`
        INSERT INTO "projects" ("id") VALUES ('p1');
        INSERT INTO "project_milestones" ("id", "project_id") VALUES ('${MILESTONE_ID}', 'p1');
        INSERT INTO "tasks" ("id", "project_id", "project_milestone_id")
          VALUES ('t1', 'p1', '${MILESTONE_ID}');
      `);

      await applyInverse(client);

      expect(await columnNames(client)).not.toContain('project_milestone_id');
      expect(await linkConstraint(client)).toBeNull();
      expect(await linkIndex(client)).toBeNull();
      // Only the link is gone — the task itself survives the rollback.
      const { rows } = await client.query<{ id: string }>(`SELECT "id" FROM "tasks"`);
      expect(rows).toEqual([{ id: 't1' }]);

      await applyMigration(client);
      expect(await columnNames(client)).toContain('project_milestone_id');
      // A re-applied column starts empty; the discarded link does not return.
      const reapplied = await client.query<{ project_milestone_id: string | null }>(
        `SELECT "project_milestone_id" FROM "tasks"`,
      );
      expect(reapplied.rows).toEqual([{ project_milestone_id: null }]);
    } finally {
      await client.close();
    }
  });
});
