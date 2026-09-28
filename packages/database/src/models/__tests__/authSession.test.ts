// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { session as authSessions, users } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import {
  AUTH_SESSION_COOKIE,
  AuthSessionModel,
  legacySessionCookieName,
  readAuthSessionToken,
  readAuthSessionTokenFromHeaders,
} from '../authSession';

const serverDB: OrviloDatabase = await getTestDB();
const userId = 'auth-session-model-test-user';
const model = new AuthSessionModel(serverDB);

const headersFor = (cookie?: string) => ({
  get: (name: string) => (name.toLowerCase() === 'cookie' ? (cookie ?? null) : null),
});

beforeEach(async () => {
  await serverDB.delete(authSessions);
  await serverDB.delete(users);
  await serverDB.insert(users).values({ id: userId });
});

afterEach(async () => {
  await serverDB.delete(authSessions);
  await serverDB.delete(users);
});

describe('AuthSessionModel', () => {
  it('creates a session with a 48-byte token and ~30d expiry', async () => {
    const created = await model.create({ userId });

    expect(created.userId).toBe(userId);
    // base64url encodes 48 random bytes into 64 characters
    expect(created.token).toMatch(/^[\w-]{64}$/);
    const ttlDays = (created.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(ttlDays).toBeGreaterThan(29);
    expect(ttlDays).toBeLessThanOrEqual(30);
  });

  it('returns the row for a live token and null for an unknown one', async () => {
    const created = await model.create({ userId });

    expect((await model.findValidByToken(created.token))?.id).toBe(created.id);
    expect(await model.findValidByToken('nope')).toBeNull();
  });

  it('rejects and deletes an expired session', async () => {
    const created = await model.create({ userId });
    await serverDB
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSessions.id, created.id));

    expect(await model.findValidByToken(created.token)).toBeNull();
    expect(await serverDB.query.session.findFirst()).toBeUndefined();
  });

  it('sliding-renews a session past half its TTL', async () => {
    const created = await model.create({ userId });
    await serverDB
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
      .where(eq(authSessions.id, created.id));

    const renewed = await model.findValidByToken(created.token);
    expect(renewed).not.toBeNull();
    const renewedDays = (renewed!.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(renewedDays).toBeGreaterThan(29);
  });

  it('deletes a session by token', async () => {
    const created = await model.create({ userId });
    await model.deleteByToken(created.token);
    expect(await model.findValidByToken(created.token)).toBeNull();
  });
});

describe('session cookie readers', () => {
  it('prefers the orvilo_auth cookie and falls back to the legacy name', () => {
    const getter = (name: string) =>
      ({ [AUTH_SESSION_COOKIE]: 'new-token', 'better-auth.session_token': 'old-token' })[name];

    expect(readAuthSessionToken(getter)).toBe('new-token');
    expect(
      readAuthSessionToken((name) =>
        name === 'better-auth.session_token' ? 'old-token' : undefined,
      ),
    ).toBe('old-token');
  });

  it('honours a custom legacy cookie prefix', () => {
    expect(legacySessionCookieName('orvilo')).toBe('orvilo.session_token');
    expect(
      readAuthSessionToken(
        (name) => (name === 'orvilo.session_token' ? 'prefixed' : undefined),
        'orvilo',
      ),
    ).toBe('prefixed');
  });

  it('parses the token out of a raw Cookie header', () => {
    expect(
      readAuthSessionTokenFromHeaders(headersFor(`a=1; ${AUTH_SESSION_COOKIE}=tok123; b=2`)),
    ).toBe('tok123');
    expect(
      readAuthSessionTokenFromHeaders(headersFor('a=1; better-auth.session_token=legacy')),
    ).toBe('legacy');
    expect(readAuthSessionTokenFromHeaders(headersFor(undefined))).toBeNull();
    expect(readAuthSessionTokenFromHeaders(headersFor('a=1'))).toBeNull();
  });

  // Better Auth signed the session cookie as `token.hmacSignature`; the table
  // stores the bare token.
  it('strips the HMAC signature from legacy cookie values', () => {
    const getter = (name: string) =>
      name === 'better-auth.session_token' ? 'legacy-token.c2lnbmF0dXJl' : undefined;

    expect(readAuthSessionToken(getter)).toBe('legacy-token');
    expect(
      readAuthSessionTokenFromHeaders(
        headersFor('better-auth.session_token=legacy-token.c2lnbmF0dXJl'),
      ),
    ).toBe('legacy-token');
    // unsigned values (older cookies) still resolve unchanged
    expect(
      readAuthSessionToken((name) =>
        name === 'better-auth.session_token' ? 'unsigned' : undefined,
      ),
    ).toBe('unsigned');
  });
});
