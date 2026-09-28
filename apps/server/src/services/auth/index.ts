import { type OrviloDatabase } from '@orvilo/database';

import { AUTH_SESSION_COOKIE, AuthSessionModel } from '@/database/models/authSession';
import { type UserItem } from '@/database/schemas';
import { authEnv } from '@/envs/auth';

import {
  assertClerkSessionActive,
  fetchClerkUser,
  provisionClerkUser,
  verifyClerkSessionToken,
} from './clerk';
import { authSessionCookieOptions } from './session';

export * from './clerk';
export * from './session';

export type AuthSessionCookie = {
  name: string;
  options: ReturnType<typeof authSessionCookieOptions>;
  value: string;
};

/**
 * Exchange a Clerk session token for an Orvilo web session.
 *
 * Verifies the session JWT (signature + issuer + authorized parties), checks
 * the session is still active and unimpersonated via the Clerk Backend API,
 * provisions the local `users` row when missing, then mints an `orvilo_auth`
 * cookie backed by an `auth_sessions` row. (Parity with the Cordy go-api
 * `/auth/clerk` exchange the accounts portal contract declares.)
 */
export const exchangeClerkSession = async (
  db: OrviloDatabase,
  params: {
    ipAddress?: string | null;
    sessionToken: string;
    userAgent?: string | null;
  },
): Promise<{ cookie: AuthSessionCookie; user: UserItem }> => {
  const claims = await verifyClerkSessionToken(params.sessionToken);
  await assertClerkSessionActive(claims);
  const clerkUser = await fetchClerkUser(claims.userId);
  const user = await provisionClerkUser(db, clerkUser);

  const session = await new AuthSessionModel(db, authEnv.AUTH_SESSION_TTL_SECONDS).create({
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    userId: user.id,
  });

  return {
    cookie: {
      name: AUTH_SESSION_COOKIE,
      options: authSessionCookieOptions(session.expiresAt),
      value: session.token,
    },
    user,
  };
};
