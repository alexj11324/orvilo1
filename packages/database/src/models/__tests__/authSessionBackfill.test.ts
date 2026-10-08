// @vitest-environment node
import { createHash } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { expect, it } from 'vitest';

import { backfillAuthSessionDigests } from '../../../../../scripts/backfill-auth-session-digests';

it('backfills legacy raw bearers in batches, preserves row data and is idempotent', async () => {
  const db = new PGlite();
  await db.exec(
    'CREATE TABLE auth_sessions (id text PRIMARY KEY, token text UNIQUE, user_id text, created_at timestamptz)',
  );
  const timestamp = new Date('2026-01-01T00:00:00Z');
  const digest = `sha256:${createHash('sha256').update('existing').digest('hex')}`;
  await db.query('INSERT INTO auth_sessions VALUES ($1,$2,$3,$4)', [
    'existing',
    digest,
    'canonical',
    timestamp,
  ]);
  for (let index = 0; index < 101; index++)
    await db.query('INSERT INTO auth_sessions VALUES ($1,$2,$3,$4)', [
      `legacy-${index}`,
      `fixture-${index}`,
      'canonical',
      timestamp,
    ]);
  const query = db.query.bind(db);
  const pool = { query, connect: async () => ({ query, release: () => {} }) } as unknown as pg.Pool;
  try {
    expect(await backfillAuthSessionDigests(pool, false)).toEqual({ changed: 0, remaining: 101 });
    expect(await backfillAuthSessionDigests(pool, true)).toEqual({ changed: 101, remaining: 0 });
    expect(await backfillAuthSessionDigests(pool, true)).toEqual({ changed: 0, remaining: 0 });
    const rows = await db.query<{ id: string; token: string; user_id: string; created_at: Date }>(
      'SELECT * FROM auth_sessions',
    );
    expect(rows.rows).toHaveLength(102);
    expect(
      rows.rows.every(
        (row) => row.user_id === 'canonical' && row.created_at.getTime() === timestamp.getTime(),
      ),
    ).toBe(true);
    expect(rows.rows.find((row) => row.id === 'existing')?.token).toBe(digest);
    expect(rows.rows.find((row) => row.id === 'legacy-0')?.token).toBe(
      `sha256:${createHash('sha256').update('fixture-0').digest('hex')}`,
    );
    expect(rows.rows.every((row) => /^sha256:[0-9a-f]{64}$/.test(row.token))).toBe(true);
  } finally {
    await db.close();
  }
});
