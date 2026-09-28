import { randomBytes } from 'node:crypto';

import { eq, lt } from 'drizzle-orm';

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

export const DEFAULT_AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** Extend the expiry once a session is past half its TTL so active users never hit the deadline. */
const REFRESH_BELOW_FRACTION = 0.5;

export type AuthSessionItem = typeof authSessionTable.$inferSelect;

/**
 * Better Auth stored the session token in `<prefix>.session_token`; those rows
 * share this table, so reading the legacy cookie keeps pre-migration sessions
 * valid until they expire. The cookie value is HMAC-signed
 * (`token.signature`), while the table holds the bare token — strip the
 * signature segment before lookup.
 */
export const legacySessionCookieName = (cookiePrefix?: string) =>
  `${cookiePrefix || 'better-auth'}.session_token`;

const stripLegacySignature = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  return separator === -1 ? value : value.slice(0, separator);
};

export type CookieGetter = (name: string) => string | null | undefined;

/** Read the session token from a cookie accessor (NextRequest.cookies or next/headers). */
export const readAuthSessionToken = (
  getCookie: CookieGetter,
  legacyCookiePrefix?: string,
): string | null =>
  getCookie(AUTH_SESSION_COOKIE) ??
  stripLegacySignature(getCookie(legacySessionCookieName(legacyCookiePrefix)));

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
export const readAuthSessionTokenFromHeaders = (
  headers: { get: (name: string) => string | null },
  legacyCookiePrefix?: string,
): string | null => {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  return (
    cookies[AUTH_SESSION_COOKIE] ??
    stripLegacySignature(cookies[legacySessionCookieName(legacyCookiePrefix)])
  );
};

export class AuthSessionModel {
  private db: OrviloDatabase;
  private ttlMs: number;

  constructor(db: OrviloDatabase, ttlSeconds: number = DEFAULT_AUTH_SESSION_TTL_SECONDS) {
    this.db = db;
    this.ttlMs = ttlSeconds * 1000;
  }

  create = async (params: {
    ipAddress?: string | null;
    userAgent?: string | null;
    userId: string;
  }): Promise<AuthSessionItem> => {
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const [created] = await this.db
      .insert(authSessionTable)
      .values({
        expiresAt,
        id: createNanoId(32)(),
        ipAddress: params.ipAddress ?? null,
        token: generateSessionToken(),
        userAgent: params.userAgent ?? null,
        userId: params.userId,
      })
      .returning();
    return created;
  };

  /** Look up a live session by token; deletes expired rows, sliding-renews near-expiry ones. */
  findValidByToken = async (token: string): Promise<AuthSessionItem | null> => {
    const record = await this.db.query.session.findFirst({
      where: eq(authSessionTable.token, token),
    });
    if (!record) return null;

    const now = Date.now();
    if (record.expiresAt.getTime() <= now) {
      await this.db.delete(authSessionTable).where(eq(authSessionTable.id, record.id));
      return null;
    }

    if (record.expiresAt.getTime() - now < this.ttlMs * REFRESH_BELOW_FRACTION) {
      const expiresAt = new Date(now + this.ttlMs);
      await this.db
        .update(authSessionTable)
        .set({ expiresAt })
        .where(eq(authSessionTable.id, record.id));
      return { ...record, expiresAt };
    }

    return record;
  };

  deleteByToken = async (token: string) => {
    await this.db.delete(authSessionTable).where(eq(authSessionTable.token, token));
  };

  cleanupExpired = async () => {
    await this.db.delete(authSessionTable).where(lt(authSessionTable.expiresAt, new Date()));
  };
}
