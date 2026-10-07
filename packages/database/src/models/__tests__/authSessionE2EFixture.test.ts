// @vitest-environment node
import type { AddressInfo } from 'node:net';

import { eq } from 'drizzle-orm';
import type * as Pg from 'pg';
import { expect, it, vi } from 'vitest';

import { authEnv } from '@/envs/auth';
import { resolveAuthSessionFromHeaders } from '@/server/services/auth/session';

import { createMockLLMServer } from '../../../../../e2e/src/mocks/llm/server';
import { MOCK_CLERK_SECRET_KEY } from '../../../../../e2e/src/support/clerkFixture';
import { createTestSession, TEST_USER } from '../../../../../e2e/src/support/seedTestUser';
import { getTestDB } from '../../core/getTestDB';
import { account, session, users } from '../../schemas';
import { AuthSessionModel } from '../authSession';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../../../node_modules/pg/esm/index.mjs', async (original) => {
  const actual = await original<typeof Pg>();
  return {
    ...actual,
    default: {
      ...actual.default,
      Client: class {
        connect = async () => {};
        end = async () => {};
        query = mocks.query;
      },
    },
  };
});
vi.mock('@/server/services/user', () => ({ UserService: class {} }));

it('maintained E2E seed authorizes through the actual digest, canonical mapping and upstream check', async () => {
  const db = await getTestDB();
  const client = (
    db as typeof db & {
      $client: {
        query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
      };
    }
  ).$client;
  mocks.query.mockImplementation((sql: string, params?: unknown[]) => client.query(sql, params));
  const server = createMockLLMServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const upstream = vi.fn();
  server.on('request', upstream);
  vi.stubEnv('DATABASE_URL', 'postgres://fixture.invalid/test-only');
  vi.spyOn(authEnv, 'CLERK_SECRET_KEY', 'get').mockReturnValue(MOCK_CLERK_SECRET_KEY);
  vi.spyOn(authEnv, 'CLERK_API_URL', 'get').mockReturnValue(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );
  try {
    const bearer = await createTestSession();
    expect(bearer).toMatch(/^[\w-]{64}$/);
    const [stored] = await db.select().from(session).where(eq(session.userId, TEST_USER.id));
    expect(stored.token.startsWith('sha256:')).toBe(true);
    expect(await new AuthSessionModel(db).findValidByToken(stored.token)).toBeNull();
    const authorized = await resolveAuthSessionFromHeaders(
      db,
      new Headers({ cookie: `orvilo_auth=${bearer}` }),
    );
    expect(authorized?.userId).toBe(TEST_USER.id);
    expect(authorized?.clerkUserId).not.toBe(TEST_USER.id);
    expect(upstream).toHaveBeenCalledOnce();
    await db.delete(account).where(eq(account.userId, TEST_USER.id));
    expect(
      await resolveAuthSessionFromHeaders(db, new Headers({ cookie: `orvilo_auth=${bearer}` })),
    ).toBeNull();
    expect(upstream).toHaveBeenCalledOnce();
  } finally {
    await db.delete(session).where(eq(session.userId, TEST_USER.id));
    await db.delete(users).where(eq(users.id, TEST_USER.id));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
