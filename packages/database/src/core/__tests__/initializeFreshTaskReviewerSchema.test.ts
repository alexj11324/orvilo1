// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OrviloDatabase } from '../../type';
import { initializeFreshTaskReviewerSchema } from '../initializeFreshTaskReviewerSchema';

let client: PGlite;
let db: OrviloDatabase;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client) as unknown as OrviloDatabase;
  await db.execute(sql`CREATE TABLE agents (id text PRIMARY KEY)`);
  await db.execute(
    sql`CREATE TABLE tasks (id text PRIMARY KEY, workflow_category text NOT NULL DEFAULT 'backlog', reviewer_user_id text)`,
  );
});

afterEach(async () => {
  await client.close();
});

describe('fresh disposable Issue reviewer schema', () => {
  it('refuses to change any schema or person values when tasks already exist', async () => {
    await db.execute(sql`INSERT INTO tasks (id, reviewer_user_id) VALUES ('existing', 'person')`);
    await expect(initializeFreshTaskReviewerSchema(db)).rejects.toThrow(
      'requires an empty tasks table',
    );
    expect((await db.execute(sql`SELECT reviewer_user_id FROM tasks`)).rows).toEqual([
      { reviewer_user_id: 'person' },
    ]);
  });

  it('creates the Agent FK and canonical review check on an empty database', async () => {
    await initializeFreshTaskReviewerSchema(db);
    const columns = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'`,
    );
    expect(columns.rows.map((row) => row.column_name)).toContain('reviewer_agent_id');
    expect(columns.rows.map((row) => row.column_name)).not.toContain('reviewer_user_id');
    await expect(
      db.execute(
        sql`INSERT INTO tasks (id, workflow_category) VALUES ('missing-reviewer', 'in_review')`,
      ),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'tasks_in_review_reviewer_required' },
    });
    await expect(
      db.execute(
        sql`INSERT INTO tasks (id, reviewer_agent_id) VALUES ('unknown-reviewer', 'missing-agent')`,
      ),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
    await db.execute(sql`INSERT INTO agents (id) VALUES ('reviewer')`);
    await db.execute(
      sql`INSERT INTO tasks (id, workflow_category, reviewer_agent_id) VALUES ('reviewed', 'in_review', 'reviewer')`,
    );
    expect((await db.execute(sql`SELECT reviewer_agent_id FROM tasks`)).rows).toEqual([
      { reviewer_agent_id: 'reviewer' },
    ]);
  });
});
