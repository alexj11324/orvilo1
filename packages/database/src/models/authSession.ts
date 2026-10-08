import { createHash, randomBytes } from 'node:crypto';

import { and, eq, lt, or } from 'drizzle-orm';

import { session as authSessionTable } from '../schemas';
import type { OrviloDatabase } from '../type';
import { createNanoId } from '../utils/idGenerator';

const generateSessionToken = () => randomBytes(48).toString('base64url');

/**
 * The app-issued web session cookie. Sessions live in `auth_sessions` and are
 * minted by `POST /api/auth/clerk` after a Clerk session token is verified.
 * (Cordy parity: same cookie name and shared-domain strategy as the accounts
 * portal flow.)
 */
export const AUTH_SESSION_COOKIE = 'orvilo_auth';

export const DEFAULT_AUTH_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const AUTH_SESSION_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;

export const hashAuthSessionToken = (token: string) =>
  `sha256:${createHash('sha256').update(token).digest('hex')}`;

const isBearerToken = (token: string) => /^[\w-]{64}$/.test(token);

export const authSessionAbsoluteExpiry = (record: Pick<AuthSessionItem, 'createdAt'>) =>
  new Date(record.createdAt.getTime() + AUTH_SESSION_ABSOLUTE_TTL_SECONDS * 1000);

/** Extend the expiry once a session is past half its TTL so active users never hit the deadline. */
const REFRESH_BELOW_FRACTION = 0.5;

export type AuthSessionItem = typeof authSessionTable.$inferSelect;

export type CookieGetter = (name: string) => string | null | undefined;

/** Read the session token from a cookie accessor (NextRequest.cookies or next/headers). */
export const readAuthSessionToken = (getCookie: CookieGetter): string | null =>
  getCookie(AUTH_SESSION_COOKIE) ?? null;

const parseCookieHeader = (header: string): Record<string, string> => {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
};

/** Read the session token directly from request headers (route handlers / middleware). */
export const readAuthSessionTokenFromHeaders = (headers: {
  get: (name: string) => string | null;
}): string | null => {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  return cookies[AUTH_SESSION_COOKIE] ?? null;
};

export class AuthSessionModel {
  private db: OrviloDatabase;
  private ttlMs: number;

  constructor(db: OrviloDatabase, ttlSeconds: number = DEFAULT_AUTH_SESSION_TTL_SECONDS) {
    if (
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds <= 0 ||
      ttlSeconds > AUTH_SESSION_ABSOLUTE_TTL_SECONDS
    )
      throw new Error('Auth session idle TTL must be positive and at most 30 days');
    this.db = db;
    this.ttlMs = ttlSeconds * 1000;
  }

  create = async (params: {
    clerkSessionId?: string | null;
    clerkUserId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    userId: string;
  }): Promise<AuthSessionItem & { bearerToken: string }> => {
    const bearerToken = generateSessionToken();
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const [created] = await this.db
      .insert(authSessionTable)
      .values({
        clerkSessionId: params.clerkSessionId ?? null,
        clerkUserId: params.clerkUserId ?? null,
        createdAt,
        expiresAt,
        id: createNanoId(32)(),
        ipAddress: params.ipAddress ?? null,
        token: hashAuthSessionToken(bearerToken),
        userAgent: params.userAgent ?? null,
        userId: params.userId,
      })
      .returning();
    return { ...created, bearerToken };
  };

  /** Lookup does not renew: the caller must first verify the upstream identity. */
  findValidByToken = async (token: string): Promise<AuthSessionItem | null> => {
    if (!isBearerToken(token)) return null;
    const [record] = await this.db
      .select()
      .from(authSessionTable)
      .where(eq(authSessionTable.token, hashAuthSessionToken(token)))
      .limit(1);
    if (!record) return null;
    const now = Date.now();
    if (record.expiresAt.getTime() <= now || authSessionAbsoluteExpiry(record).getTime() <= now) {
      await this.db.delete(authSessionTable).where(eq(authSessionTable.id, record.id));
      return null;
    }
    return record;
  };

  /** Called only after successful provider authorization; absolute expiry never moves. */
  renew = async (record: AuthSessionItem): Promise<AuthSessionItem | null> => {
    const now = Date.now();
    if (record.expiresAt.getTime() <= now || authSessionAbsoluteExpiry(record).getTime() <= now)
      return null;
    const expiresAt = new Date(
      Math.min(now + this.ttlMs, authSessionAbsoluteExpiry(record).getTime()),
    );
    if (
      record.expiresAt.getTime() - now >= this.ttlMs * REFRESH_BELOW_FRACTION ||
      expiresAt <= record.expiresAt
    )
      return record;
    const [updated] = await this.db
      .update(authSessionTable)
      .set({ expiresAt })
      .where(and(eq(authSessionTable.id, record.id), eq(authSessionTable.token, record.token)))
      .returning();
    return updated ?? null;
  };

  deleteByToken = async (token: string) => {
    if (!isBearerToken(token)) return;
    await this.db
      .delete(authSessionTable)
      .where(eq(authSessionTable.token, hashAuthSessionToken(token)));
  };

  cleanupExpired = async () => {
    await this.db
      .delete(authSessionTable)
      .where(
        or(
          lt(authSessionTable.expiresAt, new Date()),
          lt(
            authSessionTable.createdAt,
            new Date(Date.now() - AUTH_SESSION_ABSOLUTE_TTL_SECONDS * 1000),
          ),
        ),
      );
  };
}
