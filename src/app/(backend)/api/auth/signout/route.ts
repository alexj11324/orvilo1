import { NextResponse } from 'next/server';

import { getServerDB } from '@/database/core/db-adaptor';
import {
  AUTH_SESSION_COOKIE,
  AuthSessionModel,
  legacySessionCookieName,
  readAuthSessionTokenFromHeaders,
} from '@/database/models/authSession';
import { authEnv } from '@/envs/auth';
import { authSessionCookieOptions } from '@/server/services/auth';

/**
 * POST /api/auth/signout
 *
 * Destroys the current `orvilo_auth` session (both cookie + `auth_sessions`
 * row). The client then redirects to the accounts portal's `sign_out` flow so
 * the upstream Clerk session ends too.
 */
export const POST = async (request: Request) => {
  const token = readAuthSessionTokenFromHeaders(
    request.headers,
    authEnv.AUTH_COOKIE_PREFIX || 'better-auth',
  );

  if (token) {
    const db = await getServerDB();
    await new AuthSessionModel(db, authEnv.AUTH_SESSION_TTL_SECONDS).deleteByToken(token);
  }

  const response = NextResponse.json({ ok: true });
  const clearOptions = { ...authSessionCookieOptions(), expires: new Date(0) };
  response.cookies.set(AUTH_SESSION_COOKIE, '', clearOptions);
  response.cookies.set(legacySessionCookieName(authEnv.AUTH_COOKIE_PREFIX), '', clearOptions);

  return response;
};
