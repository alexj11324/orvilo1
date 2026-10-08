import { createHash } from 'node:crypto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createTestSession, TEST_USER } from './seedTestUser';

const queries = vi.hoisted(() =>
  vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>(async () => ({
    rows: [],
  })),
);
vi.mock('pg', () => ({
  default: {
    Client: class {
      connect = async () => {};
      end = async () => {};
      query = queries;
    },
  },
}));
beforeEach(() => {
  queries.mockClear();
  vi.stubEnv('DATABASE_URL', 'postgres://fixture.invalid/test-only');
});
afterEach(() => vi.unstubAllEnvs());
it('seeds the current digest/session/provider contract while returning only the cookie bearer', async () => {
  const bearer = await createTestSession();
  expect(bearer).toMatch(/^[\w-]{64}$/);
  const sessionInsert = queries.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO auth_sessions'),
  );
  expect(sessionInsert).toBeDefined();
  expect(sessionInsert![0]).toContain('clerk_session_id');
  expect(sessionInsert![0]).toContain('clerk_user_id');
  const params = sessionInsert![1]!;
  expect(params).toContain(`sha256:${createHash('sha256').update(bearer!).digest('hex')}`);
  expect(params).not.toContain(bearer);
  expect(params).toContain(`sess_e2e_${TEST_USER.id}`);
  expect(params).toContain(`clerk_e2e_${TEST_USER.id}`);
  const bindingInsert = queries.mock.calls.find(([sql]) => sql.includes('INSERT INTO accounts'));
  expect(bindingInsert?.[1]).toEqual(
    expect.arrayContaining([`clerk_e2e_${TEST_USER.id}`, TEST_USER.id]),
  );
});
