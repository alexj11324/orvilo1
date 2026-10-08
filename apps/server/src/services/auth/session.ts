import { and, eq } from 'drizzle-orm';

import {
  AUTH_SESSION_COOKIE,
  AuthSessionModel,
  readAuthSessionToken,
  readAuthSessionTokenFromHeaders,
} from '@/database/models/authSession';
import { account } from '@/database/schemas';
import { type OrviloDatabase } from '@/database/type';
import { authEnv } from '@/envs/auth';

import { assertClerkSessionActive, ClerkAuthError } from './clerk';

export { AUTH_SESSION_COOKIE };

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

const resolveToken = async (db: OrviloDatabase, token: string | null) => {
  if (!token) return null;
  const model = authSessionModel(db);
  const record = await model.findValidByToken(token);
  // A legacy session cannot gain trusted SID/sub from client data or email.
  if (!record?.clerkSessionId || !record.clerkUserId) return null;
  const bindings = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, 'clerk'), eq(account.accountId, record.clerkUserId)));
  if (!bindings.length || bindings.some((binding) => binding.userId !== record.userId)) return null;
  try {
    await assertClerkSessionActive({
      sessionId: record.clerkSessionId,
      userId: record.clerkUserId,
    });
  } catch (error) {
    if (error instanceof ClerkAuthError && error.status < 500) return null;
    // Preserve the row and cookie on provider outage; consumers return infrastructure errors.
    throw error;
  }
  return model.renew(record);
};

/** Resolve and revalidate the verified upstream session on every authorization. */
export const resolveAuthSessionFromHeaders = async (
  db: OrviloDatabase,
  headers: { get: (name: string) => string | null },
) => resolveToken(db, readAuthSessionTokenFromHeaders(headers));

export const resolveAuthSessionFromCookies = async (
  db: OrviloDatabase,
  getCookie: (name: string) => string | null | undefined,
) => resolveToken(db, readAuthSessionToken(getCookie));
