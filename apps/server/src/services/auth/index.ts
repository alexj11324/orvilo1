import { type OrviloDatabase } from '@orvilo/database';
import { and, eq } from 'drizzle-orm';

import { AUTH_SESSION_COOKIE, AuthSessionModel } from '@/database/models/authSession';
import { account, type UserItem } from '@/database/schemas';
import { authEnv } from '@/envs/auth';

import {
  assertClerkSessionActive,
  ClerkAuthError,
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
  if (clerkUser.id !== claims.userId)
    throw new ClerkAuthError('Clerk user does not match verified session');
  const { session, user } = await db.transaction(async (tx) => {
    const user = await provisionClerkUser(tx as OrviloDatabase, clerkUser);
    const bindings = await tx.query.account.findMany({
      where: and(eq(account.providerId, 'clerk'), eq(account.accountId, claims.userId)),
    });
    if (bindings.some((binding) => binding.userId !== user.id))
      throw new ClerkAuthError('Clerk account binding conflict', 409);
    if (bindings.length === 0) {
      const id = `clerk:${claims.userId}`;
      await tx
        .insert(account)
        .values({
          accountId: claims.userId,
          id,
          providerId: 'clerk',
          userId: user.id,
        })
        .onConflictDoNothing({ target: account.id });
      const binding = await tx.query.account.findFirst({ where: eq(account.id, id) });
      if (
        binding?.providerId !== 'clerk' ||
        binding.accountId !== claims.userId ||
        binding.userId !== user.id
      )
        throw new ClerkAuthError('Clerk account binding conflict', 409);
    }
    const session = await new AuthSessionModel(
      tx as OrviloDatabase,
      authEnv.AUTH_SESSION_TTL_SECONDS,
    ).create({
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      userId: user.id,
    });
    return { session, user };
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
