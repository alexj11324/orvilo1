// @vitest-environment node
import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { session as authSessions, users } from '../../schemas';
import type { OrviloDatabase } from '../../type';
import {
  AUTH_SESSION_COOKIE,
  AuthSessionModel,
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
  it('creates a session with a 48-byte token and ~7d expiry', async () => {
    const created = await model.create({ userId });

    expect(created.userId).toBe(userId);
    // base64url encodes 48 random bytes into 64 characters
    expect(created.bearerToken).toMatch(/^[\w-]{64}$/);
    const ttlDays = (created.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(ttlDays).toBeGreaterThan(6);
    expect(ttlDays).toBeLessThanOrEqual(7);
  });

  it('persists a digest and never authorizes the stored value', async () => {
    const created = await model.create({ userId });
    const [row] = await serverDB.select().from(authSessions);
    expect(row.token).toBe(
      `sha256:${createHash('sha256').update(created.bearerToken).digest('hex')}`,
    );
    expect(await model.findValidByToken(row.token)).toBeNull();
  });

  it('caps renewal at the immutable absolute deadline', async () => {
    const created = await model.create({ userId });
    const createdAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    await serverDB
      .update(authSessions)
      .set({ createdAt, expiresAt: new Date(Date.now() + 1000) })
      .where(eq(authSessions.id, created.id));
    const live = await model.findValidByToken(created.bearerToken);
    expect(live!.expiresAt.getTime()).toBeLessThan(Date.now() + 2000);
    const renewed = await model.renew(live!);
    expect(renewed!.expiresAt.getTime()).toBe(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  it('rejects absolute-expired rows even when idle expiry is live', async () => {
    const created = await model.create({ userId });
    await serverDB
      .update(authSessions)
      .set({ createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(eq(authSessions.id, created.id));
    expect(await model.findValidByToken(created.bearerToken)).toBeNull();
  });

  it.each([0, -1, NaN, Infinity, 30 * 24 * 60 * 60 + 1])(
    'rejects invalid idle policy %s',
    (ttl) => {
      expect(() => new AuthSessionModel(serverDB, ttl)).toThrow();
    },
  );

  it('returns the row for a live token and null for an unknown one', async () => {
    const created = await model.create({ userId });

    expect((await model.findValidByToken(created.bearerToken))?.id).toBe(created.id);
    expect(await model.findValidByToken('nope')).toBeNull();
  });

  it('rejects and deletes an expired session', async () => {
    const created = await model.create({ userId });
    await serverDB
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSessions.id, created.id));

    expect(await model.findValidByToken(created.bearerToken)).toBeNull();
    expect(await serverDB.query.session.findFirst()).toBeUndefined();
  });

  it('sliding-renews a session past half its TTL', async () => {
    const created = await model.create({ userId });
    await serverDB
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) })
      .where(eq(authSessions.id, created.id));

    const live = await model.findValidByToken(created.bearerToken);
    const renewed = await model.renew(live!);
    expect(renewed).not.toBeNull();
    const renewedDays = (renewed!.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(renewedDays).toBeGreaterThan(6);
  });

  it('deletes a session by token', async () => {
    const created = await model.create({ userId });
    await model.deleteByToken(created.bearerToken);
    expect(await model.findValidByToken(created.bearerToken)).toBeNull();
  });
});

describe('session cookie readers', () => {
  it('reads only the orvilo_auth cookie', () => {
    const getter = (name: string) =>
      ({ [AUTH_SESSION_COOKIE]: 'new-token', 'other.cookie': 'other' })[name];

    expect(readAuthSessionToken(getter)).toBe('new-token');
    expect(readAuthSessionToken(() => undefined)).toBeNull();
  });

  it('parses the token out of a raw Cookie header', () => {
    expect(
      readAuthSessionTokenFromHeaders(headersFor(`a=1; ${AUTH_SESSION_COOKIE}=tok123; b=2`)),
    ).toBe('tok123');
    expect(readAuthSessionTokenFromHeaders(headersFor(undefined))).toBeNull();
    expect(readAuthSessionTokenFromHeaders(headersFor('a=1'))).toBeNull();
  });
});
