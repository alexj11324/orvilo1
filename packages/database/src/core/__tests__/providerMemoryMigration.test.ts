// @vitest-environment node
import path from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrations = readMigrationFiles({
  migrationsFolder: path.join(__dirname, '../../../migrations'),
});
// Forward additions after the shared 0196 base: the consolidated
// 0197_cloud_control_plane migration (provider-binding and experience-memory
// additions alongside the event/handoff tables) plus 0198_sudden_magma, which
// restores the ai_providers/ai_models tables retired by the P30 drop, plus
// 0199_dispatch_recovery_bounds (task_dispatches.recovery_attempts), plus
// 0200_project_agent_tiers (project_agents.tier, task_dispatches.tier), plus
// 0201_retire_task_status_parked_backfill (parked-marker/workflow convergence),
// plus 0202_pr_delivery_gate_workflow_category (gate trigger rebind), plus
// 0203_device_capability_snapshot (devices capability evidence columns).
// Reapplication belongs to this bounded, idempotent repair sequence. Later
// migrations use the normal migration ledger and may create tables only once.
const additions = migrations.slice(197, 204);
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
    // The shadow key is (user_id, legacy_id): a second copy under another owner
    // is legal, and NULL legacy_id rows never collide.
    await db.exec(`INSERT INTO users (id) VALUES ('other-owner')`);
    await db.exec(`INSERT INTO user_experience_memories (user_id,legacy_id,content)
      VALUES ('other-owner','legacy-experience','other shadow'),
             ('migration-owner',NULL,'fresh memory 1'),
             ('migration-owner',NULL,'fresh memory 2')`);
    await expect(
      db.exec(`UPDATE user_experience_memories SET lifecycle='invalid'`),
    ).rejects.toThrow();
    await expect(db.exec(`UPDATE user_experience_memories SET revision=0`)).rejects.toThrow();
    // Content boundary: the check caps octet_length at 16384 — exactly at the
    // limit passes, one byte over fails.
    await expect(
      db.exec(`UPDATE user_experience_memories SET content=repeat('中',6000)`),
    ).rejects.toThrow();
    await expect(
      db.exec(`INSERT INTO user_experience_memories (user_id,content)
      VALUES ('migration-owner',repeat('x',16385))`),
    ).rejects.toThrow();
    await db.exec(`INSERT INTO user_experience_memories (user_id,content)
      VALUES ('migration-owner',repeat('x',16384))`);
  });

  it('cascades user deletion across prime, legacy and provider rows', async () => {
    expect(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM user_experience_memories WHERE user_id='migration-owner'`,
        )
      ).rows,
    ).toEqual([{ n: 4 }]);
    await db.exec(`DELETE FROM users WHERE id='migration-owner'`);
    expect(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM user_experience_memories WHERE user_id='migration-owner'`,
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM provider_bindings WHERE user_id='migration-owner'`,
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
    expect(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM user_memories_experiences WHERE user_id='migration-owner'`,
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
    // The other owner's rows are untouched by the cascade.
    expect((await db.query(`SELECT content FROM user_experience_memories`)).rows).toEqual([
      { content: 'other shadow' },
    ]);
  });
});
