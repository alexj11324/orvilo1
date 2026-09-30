// @vitest-environment node
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = readMigrationFiles({
  migrationsFolder: path.join(__dirname, '../../../migrations'),
});
// The provider-binding and experience-memory additions ship as one consolidated
// 0196_cloud_control_plane migration alongside the event/handoff tables.
const additions = migrations.slice(196);
const db = new PGlite({ extensions: { vector } });
const applyAdditions = async () => {
  for (const migration of additions) {
    for (const statement of migration.sql) await db.exec(statement);
  }
};

describe('provider and experience forward migrations', () => {
  beforeAll(async () => {
    // Match the existing PGlite migration harness: pg_search requires server PostgreSQL.
    for (const migration of migrations.slice(0, 196)) {
      if (migration.sql.some((statement) => /pg_search|bm25/i.test(statement))) continue;
      for (const statement of migration.sql) await db.exec(statement);
    }
    await db.exec("INSERT INTO users (id) VALUES ('migration-owner')");
    await db.exec(`INSERT INTO user_memories_experiences (id,user_id,key_learning)
      VALUES ('legacy-experience','migration-owner','保留旧经验 / preserve legacy experience')`);
  }, 120_000);
  afterAll(async () => {
    await db.close();
  });

  it('rolls back a failed upgrade without deleting existing memories', async () => {
    expect(additions).toHaveLength(1);
    await db.exec('BEGIN');
    await applyAdditions();
    await expect(
      db.exec(`INSERT INTO provider_bindings (user_id,config)
      VALUES ('missing-owner','{}')`),
    ).rejects.toThrow();
    await db.exec('ROLLBACK');
    const tables = await db.query(`SELECT to_regclass('provider_bindings') AS provider,
      to_regclass('user_experience_memories') AS experience`);
    expect(tables.rows).toEqual([{ provider: null, experience: null }]);
    expect((await db.query('SELECT key_learning FROM user_memories_experiences')).rows).toEqual([
      { key_learning: '保留旧经验 / preserve legacy experience' },
    ]);
  });

  it('applies and reapplies additions without overwriting new or legacy data', async () => {
    await applyAdditions();
    await db.exec(`INSERT INTO provider_bindings (user_id,config)
      VALUES ('migration-owner','{"name":"fixture"}'::jsonb)`);
    await db.exec(`INSERT INTO user_experience_memories (user_id,legacy_id,content)
      VALUES ('migration-owner','legacy-experience','shadow fixture')`);
    await applyAdditions();
    expect((await db.query('SELECT config FROM provider_bindings')).rows).toEqual([
      { config: { name: 'fixture' } },
    ]);
    expect((await db.query('SELECT content,revision FROM user_experience_memories')).rows).toEqual([
      { content: 'shadow fixture', revision: 1 },
    ]);
    expect((await db.query('SELECT key_learning FROM user_memories_experiences')).rows).toEqual([
      { key_learning: '保留旧经验 / preserve legacy experience' },
    ]);
  });

  it('enforces foreign keys, shadow identity uniqueness and lifecycle constraints', async () => {
    await expect(
      db.exec(`INSERT INTO provider_bindings (user_id,config)
      VALUES ('missing-owner','{}')`),
    ).rejects.toThrow();
    await expect(
      db.exec(`INSERT INTO user_experience_memories (user_id,legacy_id,content)
      VALUES ('migration-owner','legacy-experience','duplicate')`),
    ).rejects.toThrow();
    await expect(
      db.exec(`UPDATE user_experience_memories SET lifecycle='invalid'`),
    ).rejects.toThrow();
    await expect(db.exec(`UPDATE user_experience_memories SET revision=0`)).rejects.toThrow();
    await expect(
      db.exec(`UPDATE user_experience_memories SET content=repeat('中',6000)`),
    ).rejects.toThrow();
  });
});
