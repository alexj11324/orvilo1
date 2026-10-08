import { type NextRequest, NextResponse } from 'next/server';

import { getServerDB } from '@/database/core/db-adaptor';
import { authEnv } from '@/envs/auth';
import { clearMismatchedOIDCSession } from '@/libs/oidc-provider/session-cleanup';
import { ClerkAuthError, exchangeClerkSession } from '@/server/services/auth';

const accountsOrigin = () => {
  try {
    return new URL(authEnv.AUTH_ACCOUNTS_URL || 'https://accounts.aspectlylabs.com').origin;
  } catch {
    return null;
  }
};

/**
 * The accounts portal calls this endpoint cross-origin when the worker has no
 * API proxy configured; scope CORS to the configured portal origin only.
 */
const corsHeaders = (request: NextRequest): Record<string, string> => {
  const origin = request.headers.get('origin');
  const allowed = accountsOrigin();
  if (!origin || !allowed || origin !== allowed) return {};

  return {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};

export const OPTIONS = (request: NextRequest) =>
  new NextResponse(null, { headers: corsHeaders(request), status: 204 });

/**
 * POST /api/auth/clerk
 * Exchange a Clerk session token (Bearer) for an Orvilo `orvilo_auth` session cookie.
 */
export const POST = async (request: NextRequest) => {
  try {
    const authorization = request.headers.get('authorization');
    const token = authorization?.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : null;
    if (!token) {
      return NextResponse.json(
        { error: 'Missing Clerk session token' },
        { headers: corsHeaders(request), status: 401 },
      );
    }

    const db = await getServerDB();
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const { cookie, user } = await exchangeClerkSession(db, {
      ipAddress: forwardedFor ?? request.headers.get('x-real-ip'),
      sessionToken: token,
      userAgent: request.headers.get('user-agent'),
    });

    const response = NextResponse.json(
      {
        user: {
          email: user.email,
          emailVerified: user.emailVerified,
          id: user.id,
          image: user.avatar,
          name: user.fullName,
          username: user.username,
        },
      },
      { headers: corsHeaders(request), status: 200 },
    );
    await clearMismatchedOIDCSession(db, user.id, {
      getCookie: (name) => request.cookies.get(name)?.value ?? null,
      setCookie: (name, value, options) => response.cookies.set(name, value, options),
    });
    response.cookies.set(cookie.name, cookie.value, cookie.options);

    return response;
  } catch (error) {
    const status = error instanceof ClerkAuthError ? error.status : 500;
    if (status === 500) console.error('[auth/clerk] exchange failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Exchange failed' },
      { headers: corsHeaders(request), status },
    );
  }
};
