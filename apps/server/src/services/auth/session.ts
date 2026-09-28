import {
  AUTH_SESSION_COOKIE,
  AuthSessionModel,
  readAuthSessionToken,
  readAuthSessionTokenFromHeaders,
} from '@/database/models/authSession';
import { type OrviloDatabase } from '@/database/type';
import { authEnv } from '@/envs/auth';

export { AUTH_SESSION_COOKIE };

const legacyCookiePrefix = () => authEnv.AUTH_COOKIE_PREFIX || 'better-auth';

const authSessionModel = (db: OrviloDatabase) =>
  new AuthSessionModel(db, authEnv.AUTH_SESSION_TTL_SECONDS);

/** `Set-Cookie` attributes for the web session cookie. */
export const authSessionCookieOptions = (expiresAt?: Date) => ({
  ...(expiresAt ? { expires: expiresAt } : {}),
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
  ...(authEnv.AUTH_COOKIE_DOMAIN ? { domain: authEnv.AUTH_COOKIE_DOMAIN } : {}),
});

/** Resolve the current session from request headers (`cookie` header). */
export const resolveAuthSessionFromHeaders = async (
  db: OrviloDatabase,
  headers: { get: (name: string) => string | null },
) => {
  const token = readAuthSessionTokenFromHeaders(headers, legacyCookiePrefix());
  if (!token) return null;

  return authSessionModel(db).findValidByToken(token);
};

/** Resolve the current session from a cookie accessor (NextRequest.cookies / next/headers). */
export const resolveAuthSessionFromCookies = async (
  db: OrviloDatabase,
  getCookie: (name: string) => string | null | undefined,
) => {
  const token = readAuthSessionToken(getCookie, legacyCookiePrefix());
  if (!token) return null;

  return authSessionModel(db).findValidByToken(token);
};
