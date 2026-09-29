import { type NextRequest, NextResponse } from 'next/server';

import { getServerDB } from '@/database/core/db-adaptor';
import { resolveAuthSessionFromHeaders } from '@/server/services/auth/session';
import { startGitHubOAuth } from '@/server/services/githubOAuth';

/** Hosted entry used by desktop so one click starts the existing Web OAuth flow. */
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const session = await resolveAuthSessionFromHeaders(await getServerDB(), request.headers);
  if (!session?.userId) {
    const signIn = new URL('/signin', request.nextUrl.origin);
    signIn.searchParams.set('callbackUrl', '/oauth/github/start');
    return NextResponse.redirect(signIn);
  }

  // Optional attempt nonce: the opener mints one per authorization attempt so
  // the callback's postMessage can be correlated back to that attempt.
  const attempt = request.nextUrl.searchParams.get('attempt') ?? undefined;
  const safeAttempt = attempt && /^[\w-]{1,64}$/.test(attempt) ? attempt : undefined;

  try {
    return NextResponse.redirect(await startGitHubOAuth(session.userId, safeAttempt));
  } catch (error) {
    console.error(
      '[githubOAuth:startRoute]',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return new NextResponse('Could not start GitHub authorization', {
      headers: { 'cache-control': 'no-store' },
      status: 500,
    });
  }
};
