// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, it, vi } from 'vitest';

import { backfillAuthSessionDigests } from '../../../../../scripts/migrateServerDB/backfillAuthSessionDigests';

const mocks = vi.hoisted(() => ({ db: {} as Record<string, unknown>, migrate: vi.fn() }));
vi.mock('../../../../../scripts/migrateServerDB/errorHint', () => ({}));
vi.mock('dotenv', () => ({
  config: vi.fn(() => {
    process.env.DATABASE_URL = 'postgres://fixture.invalid/fallback-must-not-be-used';
    return {};
  }),
}));
vi.mock('dotenv-expand', () => ({ default: { expand: vi.fn() } }));
vi.mock('drizzle-orm/node-postgres/migrator', () => ({ migrate: mocks.migrate }));
vi.mock('drizzle-orm/neon-serverless/migrator', () => ({ migrate: mocks.migrate }));
vi.mock('../../server', () => ({ serverDB: mocks.db }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('normal db:migrate hashes legacy rows before success, preserves data and repeats idempotently', async () => {
  const fixture = new PGlite();
  await fixture.exec(
    'CREATE TABLE auth_sessions (id text PRIMARY KEY, token text UNIQUE, user_id text, created_at timestamptz)',
  );
  await fixture.query('INSERT INTO auth_sessions VALUES ($1,$2,$3,$4)', [
    'legacy',
    'a'.repeat(64),
    'canonical',
    new Date('2026-01-01T00:00:00Z'),
  ]);
  const query = fixture.query.bind(fixture);
  mocks.db.$client = { query, connect: async () => ({ query, release: () => {} }) };
  mocks.migrate.mockImplementation(async () => {
    await fixture.exec(
      'ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS clerk_session_id text; ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS clerk_user_id text;',
    );
  });
  vi.stubEnv('DATABASE_URL', 'postgres://fixture.invalid/explicit-test-only');
  vi.stubEnv('DATABASE_DRIVER', 'node');
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  try {
    await import('../../../../../scripts/migrateServerDB/index');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(process.env.DATABASE_URL).toBe('postgres://fixture.invalid/explicit-test-only');
    const first = await fixture.query<{ token: string; user_id: string; created_at: Date }>(
      'SELECT * FROM auth_sessions',
    );
    expect(first.rows[0].token).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.rows[0].user_id).toBe('canonical');
    expect(first.rows[0].created_at.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    exit.mockClear();
    vi.resetModules();
    await import('../../../../../scripts/migrateServerDB/index');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect((await fixture.query('SELECT token FROM auth_sessions')).rows[0]).toEqual({
      token: first.rows[0].token,
    });
  } finally {
    await fixture.close();
  }
});

it('normal db:migrate fails closed when digest backfill fails', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [{ id: 'legacy', token: 'a'.repeat(64) }] });
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('UPDATE')) throw new Error('fixture storage failure');
    return { rows: [{ id: 'legacy', token: 'a'.repeat(64) }] };
  });
  const release = vi.fn();
  mocks.db.$client = { connect: async () => ({ query, release }) };
  mocks.migrate.mockResolvedValue(undefined);
  vi.stubEnv('DATABASE_URL', 'postgres://fixture.invalid/explicit-test-only');
  vi.stubEnv('DATABASE_DRIVER', 'node');
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../../../../../scripts/migrateServerDB/index');
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  expect(exit).not.toHaveBeenCalledWith(0);
  expect(query).toHaveBeenCalledWith('ROLLBACK');
  expect(release).toHaveBeenCalledOnce();
});

it('Docker migration entrypoint hashes a real legacy fixture before signaling readiness', async () => {
  const fixture = new PGlite();
  await fixture.exec('CREATE TABLE auth_sessions (id text PRIMARY KEY, token text UNIQUE)');
  await fixture.query('INSERT INTO auth_sessions VALUES ($1,$2)', ['legacy', 'a'.repeat(64)]);
  const query = fixture.query.bind(fixture);
  const pool = { connect: async () => ({ query, release: () => {} }) };
  const exit = vi.fn();
  const source = await readFile(
    new URL('../../../../../scripts/migrateServerDB/docker.cjs', import.meta.url),
    'utf8',
  );
  const context = createContext({
    __dirname: '/fixture',
    console: { log: vi.fn(), error: vi.fn(), info: vi.fn() },
    process: { env: { DATABASE_URL: 'postgres://fixture.invalid/explicit-test-only' }, exit },
    require: (name: string) => {
      if (name === 'node:path') return { join: (...paths: string[]) => paths.join('/') };
      if (name === 'pg')
        return {
          Pool: class {
            constructor() {
              return pool;
            }
          },
        };
      if (name === 'drizzle-orm/node-postgres') return { drizzle: () => ({}) };
      if (name === 'drizzle-orm/node-postgres/migrator') return { migrate: async () => {} };
      if (name === './auth-session-digests.cjs') return { backfillAuthSessionDigests };
      if (name === './errorHint') return {};
      throw new Error(`Unexpected fixture dependency ${name}`);
    },
  });
  try {
    runInContext(source, context);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(
      (await fixture.query<{ token: string }>('SELECT token FROM auth_sessions')).rows[0].token,
    ).toMatch(/^sha256:[0-9a-f]{64}$/);
  } finally {
    await fixture.close();
  }
});
