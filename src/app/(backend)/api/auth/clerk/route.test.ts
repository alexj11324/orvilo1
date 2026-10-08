// @vitest-environment node
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import Keygrip from 'keygrip';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { oidcSessions } from '@/database/schemas';
import { OIDC_SESSION_COOKIE_NAMES } from '@/libs/oidc-provider/cookies';
import { ClerkAuthError } from '@/server/services/auth';

import { POST } from './route';

const mocks = vi.hoisted(() => ({
  cookieKey: 'clerk-oidc-alignment-test-key',
  exchangeClerkSession: vi.fn(),
  getServerDB: vi.fn(),
}));

const COOKIE_KEY = mocks.cookieKey;
const CURRENT_SESSION = 'current-oidc-session';
const OTHER_SESSION = 'unrelated-oidc-session';
const LOCAL_USER = 'legacy-local-user-b';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: mocks.getServerDB }));
vi.mock('@/config/db', () => ({ serverDBEnv: { KEY_VAULTS_SECRET: mocks.cookieKey } }));
vi.mock('@/envs/auth', () => ({
  authEnv: { AUTH_ACCOUNTS_URL: 'https://accounts.example.test' },
}));
vi.mock('@/server/services/auth', () => ({
  ClerkAuthError: class ClerkAuthError extends Error {
    readonly status = 401;
  },
  exchangeClerkSession: mocks.exchangeClerkSession,
}));

const createDb = (currentUserId = 'local-user-a') => {
  const sessions = new Map([
    [CURRENT_SESSION, { userId: currentUserId }],
    [OTHER_SESSION, { userId: 'local-user-a' }],
  ]);
  const parameter = (condition: SQL) => new PgDialect().sqlToQuery(condition).params[0];
  const selectWhere = vi.fn((condition: SQL) => ({
    limit: async () => {
      const row = sessions.get(parameter(condition) as string);
      return row ? [row] : [];
    },
  }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const deleteWhere = vi.fn(async (condition: SQL) => {
    sessions.delete(parameter(condition) as string);
  });
  const delete_ = vi.fn(() => ({ where: deleteWhere }));
  const db = { delete: delete_, select: vi.fn(() => ({ from })) };
  return { db, delete_, deleteWhere, from, sessions };
};

const signedCookie = () => {
  const signature = new Keygrip([COOKIE_KEY]).sign(`_session=${CURRENT_SESSION}`);
  return `_session=${CURRENT_SESSION}; _session.sig=${signature}`;
};

const request = (cookie?: string, authenticated = true) =>
  new NextRequest('https://product.example.test/api/auth/clerk', {
    headers: {
      ...(authenticated ? { authorization: 'Bearer verified-clerk-fixture' } : {}),
      ...(cookie ? { cookie } : {}),
      origin: 'https://accounts.example.test',
    },
    method: 'POST',
  });

describe('POST /api/auth/clerk OIDC principal alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeClerkSession.mockResolvedValue({
      cookie: {
        name: 'orvilo_auth',
        options: { httpOnly: true, path: '/', sameSite: 'lax', secure: true },
        value: 'canonical-web-session',
      },
      user: { clerkUserId: 'external-clerk-user-b', id: LOCAL_USER },
    });
  });

  it('reconciles only the signed current browser session to the canonical local user', async () => {
    const { db, delete_, from, sessions } = createDb();
    mocks.getServerDB.mockResolvedValue(db);

    const incoming = request(`${signedCookie()}; unrelated_cookie=keep`);
    const response = await POST(incoming);

    expect(response.status).toBe(200);
    expect((await response.json()).user.id).toBe(LOCAL_USER);
    expect(response.cookies.get('orvilo_auth')?.value).toBe('canonical-web-session');
    expect(sessions.has(CURRENT_SESSION)).toBe(false);
    expect(sessions.get(OTHER_SESSION)).toEqual({ userId: 'local-user-a' });
    expect(from).toHaveBeenCalledWith(oidcSessions);
    expect(delete_).toHaveBeenCalledExactlyOnceWith(oidcSessions);
    expect(incoming.cookies.get('unrelated_cookie')?.value).toBe('keep');
    expect(
      response.cookies
        .getAll()
        .map(({ name }) => name)
        .sort(),
    ).toEqual([...OIDC_SESSION_COOKIE_NAMES, 'orvilo_auth'].sort());
    for (const name of OIDC_SESSION_COOKIE_NAMES) {
      expect(response.cookies.get(name)).toMatchObject({
        expires: new Date(0),
        httpOnly: true,
        path: '/',
        value: '',
      });
    }
  });

  it('preserves an OIDC session that already belongs to the canonical local user', async () => {
    const { db, delete_, sessions } = createDb(LOCAL_USER);
    mocks.getServerDB.mockResolvedValue(db);

    const response = await POST(request(signedCookie()));

    expect(response.status).toBe(200);
    expect(sessions.get(CURRENT_SESSION)).toEqual({ userId: LOCAL_USER });
    expect(sessions.has(OTHER_SESSION)).toBe(true);
    expect(delete_).not.toHaveBeenCalled();
    for (const name of OIDC_SESSION_COOKIE_NAMES) {
      expect(response.cookies.get(name)).toBeUndefined();
    }
  });

  it.each([
    { cookie: undefined, expired: false },
    { cookie: `_session=${CURRENT_SESSION}`, expired: true },
    { cookie: `_session=${CURRENT_SESSION}; _session.sig=invalid-signature`, expired: true },
    // NextRequest drops malformed cookie values before the helper receives them.
    { cookie: '_session=%E0%A4%A; _session.sig=invalid-signature', expired: false },
  ])('keeps untrusted cookies away from session rows: $cookie', async ({ cookie, expired }) => {
    const { db, delete_, sessions } = createDb();
    mocks.getServerDB.mockResolvedValue(db);

    const response = await POST(request(cookie));

    expect(response.status).toBe(200);
    expect(sessions.size).toBe(2);
    expect(db.select).not.toHaveBeenCalled();
    expect(delete_).not.toHaveBeenCalled();
    for (const name of OIDC_SESSION_COOKIE_NAMES) {
      if (expired) {
        expect(response.cookies.get(name)).toMatchObject({
          expires: new Date(0),
          httpOnly: true,
          path: '/',
          value: '',
        });
      } else {
        expect(response.cookies.get(name)).toBeUndefined();
      }
    }
  });

  it('does not reconcile or establish cookies when Clerk verification fails', async () => {
    const { db, delete_, sessions } = createDb();
    mocks.getServerDB.mockResolvedValue(db);
    mocks.exchangeClerkSession.mockRejectedValue(new ClerkAuthError('Rejected fixture'));

    const response = await POST(request(signedCookie()));

    expect(response.status).toBe(401);
    expect(sessions.size).toBe(2);
    expect(db.select).not.toHaveBeenCalled();
    expect(delete_).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toEqual([]);
  });

  it('rejects a missing Clerk token before resolving or reconciling any session', async () => {
    const response = await POST(request(signedCookie(), false));

    expect(response.status).toBe(401);
    expect(mocks.getServerDB).not.toHaveBeenCalled();
    expect(mocks.exchangeClerkSession).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toEqual([]);
  });
});
