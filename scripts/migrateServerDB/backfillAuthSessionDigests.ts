import { createHash } from 'node:crypto';

import type { Pool as NeonPool } from '@neondatabase/serverless';
import type pg from 'pg';

const rawPredicate = "token !~ '^sha256:[0-9a-f]{64}$'";

export const backfillAuthSessionDigests = async (pool: pg.Pool | NeonPool, apply: boolean) => {
  if (!apply) {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*) FROM auth_sessions WHERE ${rawPredicate}`,
    );
    return { changed: 0, remaining: Number(result.rows[0].count) };
  }
  let changed = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; token: string }>(
        `SELECT id, token FROM auth_sessions WHERE ${rawPredicate} ORDER BY id LIMIT 100 FOR UPDATE`,
      );
      for (const row of result.rows) {
        const digest = `sha256:${createHash('sha256').update(row.token).digest('hex')}`;
        await client.query('UPDATE auth_sessions SET token = $1 WHERE id = $2', [digest, row.id]);
      }
      await client.query('COMMIT');
      changed += result.rows.length;
      if (!result.rows.length) return { changed, remaining: 0 };
    } catch {
      await client.query('ROLLBACK');
      throw new Error('Auth session digest backfill failed; current batch rolled back');
    } finally {
      client.release();
    }
  }
};
