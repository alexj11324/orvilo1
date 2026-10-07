// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_SESSION_COOKIE, hashAuthSessionToken } from '@/database/models/authSession';
import { account } from '@/database/schemas';
import type * as AuthService from '@/server/services/auth';
import type * as ClerkService from '@/server/services/auth/clerk';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  fetchClerkUser: vi.fn(),
  getServerDB: vi.fn(),
  active: vi.fn(),
}));
vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: mocks.getServerDB }));
vi.mock('@/server/services/auth', async (original) => ({
  ...(await original<typeof AuthService>()),
  fetchClerkUser: mocks.fetchClerkUser,
}));

vi.mock('@/server/services/auth/clerk', async (original) => ({
  ...(await original<typeof ClerkService>()),
  assertClerkSessionActive: mocks.active,
}));

const localId = 'migrated-canonical-user';
const externalId = 'user_clerk_external';
type Binding = Pick<typeof account.$inferSelect, 'accountId' | 'providerId' | 'userId'>;
const binding = (userId = localId, accountId = externalId): Binding => ({
  accountId,
  providerId: 'clerk',
  userId,
});

const createDb = (bindings: Binding[], { expired = false, userId = localId } = {}) => {
  const token = 'a'.repeat(64);
  const findMany = vi.fn(async ({ where }: { where: SQL }) => {
    const { params } = new PgDialect().sqlToQuery(where);
    return bindings.filter((row) => row.userId === params[0] && row.providerId === params[1]);
  });
  const db = {
    delete: vi.fn(() => ({ where: vi.fn(async () => {}) })),
    select: () => ({
      from: (table: unknown) => ({
        where: (where: SQL) => {
          const { params } = new PgDialect().sqlToQuery(where);
          if (table === account)
            return Promise.resolve(
              bindings.filter((row) => row.providerId === params[0] && row.accountId === params[1]),
            );
          return {
            limit: async () =>
              params[0] === hashAuthSessionToken(token)
                ? [
                    {
                      id: 'current-session',
                      token: hashAuthSessionToken(token),
                      createdAt: new Date(),
                      expiresAt: new Date(
                        Date.now() + (expired ? -60_000 : 7 * 24 * 60 * 60 * 1000),
                      ),
                      clerkSessionId: 'sid-fixture',
                      clerkUserId: externalId,
                      userId,
                    },
                  ]
                : [],
          };
        },
      }),
    }),
    query: {
      account: { findMany },
      session: {
        findFirst: vi.fn(async ({ where }: { where: SQL }) => {
          const { params } = new PgDialect().sqlToQuery(where);
          if (params[0] !== token) return undefined;
          return {
            expiresAt: new Date(Date.now() + (expired ? -60_000 : 30 * 24 * 60 * 60 * 1000)),
            id: 'current-session',
            token,
            userId,
          };
        }),
      },
    },
  };
  mocks.getServerDB.mockResolvedValue(db);
  return { db, findMany, token };
};
const request = (token?: string) =>
  new Request('https://product.example.test/api/auth/accounts', {
    headers: token ? { cookie: `${AUTH_SESSION_COOKIE}=${token}` } : {},
  });

describe('GET /api/auth/accounts trusted Clerk recipient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.active.mockResolvedValue(undefined);
    mocks.fetchClerkUser.mockImplementation(async (id: string) => ({
      external_accounts: [
        {
          email_address: 'fixture@example.test',
          provider: 'oauth_google',
          provider_user_id: 'google-fixture',
        },
      ],
      id,
      password_enabled: true,
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([localId, externalId])(
    'loads external Clerk providers for canonical session %s',
    async (userId) => {
      const { token } = createDb([binding(userId)], { userId });
      const response = await GET(request(token));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        hasPasswordAccount: true,
        providers: [
          {
            email: 'fixture@example.test',
            provider: 'google',
            providerAccountId: 'google-fixture',
          },
        ],
      });
      expect(mocks.fetchClerkUser).toHaveBeenCalledExactlyOnceWith(externalId);
    },
  );

  it('retains all linked Clerk account methods without treating other provider rows as Clerk IDs', async () => {
    const secondId = 'user_clerk_second';
    const { token } = createDb([
      binding(),
      binding(localId, secondId),
      { ...binding(), providerId: 'google', accountId: 'google-provider-id' },
    ]);
    mocks.fetchClerkUser.mockImplementation(async (id: string) => ({
      external_accounts: [
        { provider: id === externalId ? 'oauth_google' : 'oauth_github', provider_user_id: id },
      ],
      id,
      password_enabled: id === secondId,
    }));
    const response = await GET(request(token));
    expect(await response.json()).toEqual({
      hasPasswordAccount: true,
      providers: [
        { provider: 'google', providerAccountId: externalId },
        { provider: 'github', providerAccountId: secondId },
      ],
    });
    expect(mocks.fetchClerkUser).toHaveBeenCalledTimes(2);
    expect(mocks.fetchClerkUser).not.toHaveBeenCalledWith('google-provider-id');
  });

  it.each([undefined, 'unknown-web-session'])(
    'rejects missing or unmatched session %s before Clerk lookup',
    async (token) => {
      const { findMany } = createDb([binding()]);
      const response = await GET(request(token));
      expect(response.status).toBe(401);
      expect(findMany).not.toHaveBeenCalled();
      expect(mocks.fetchClerkUser).not.toHaveBeenCalled();
    },
  );

  it('rejects a stale web session before reading any external account binding', async () => {
    const { db, findMany, token } = createDb([binding()], { expired: true });
    expect((await GET(request(token))).status).toBe(401);
    expect(db.delete).toHaveBeenCalledOnce();
    expect(findMany).not.toHaveBeenCalled();
    expect(mocks.fetchClerkUser).not.toHaveBeenCalled();
  });

  it('reports absent own binding honestly without exposing another user or guessing local ID', async () => {
    const { token } = createDb([
      binding('another-canonical-user'),
      { ...binding(), providerId: 'google' },
    ]);
    const response = await GET(request(token));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(mocks.fetchClerkUser).not.toHaveBeenCalled();
  });

  it('preserves the cookie and returns infrastructure failure during session verification outage', async () => {
    const { token, db } = createDb([binding()]);
    mocks.active.mockRejectedValue(new Error('upstream unavailable'));
    const response = await GET(request(token));
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(db.delete).not.toHaveBeenCalled();
    expect(mocks.fetchClerkUser).not.toHaveBeenCalled();
  });

  it('does not represent Clerk lookup failure as an empty successful provider list', async () => {
    const { token } = createDb([binding()]);
    mocks.fetchClerkUser.mockRejectedValue(new Error('Clerk backend unavailable'));
    const response = await GET(request(token));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'linked_accounts_unavailable' });
  });

  it('rejects a Clerk response for an identity other than the trusted account recipient', async () => {
    const { token } = createDb([binding()]);
    mocks.fetchClerkUser.mockResolvedValue({
      id: 'another-external-user',
      password_enabled: true,
      external_accounts: [{ provider: 'oauth_google', provider_user_id: 'private-other-provider' }],
    });
    const response = await GET(request(token));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'linked_accounts_unavailable' });
  });
});
