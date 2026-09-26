import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { startGitHubOAuth } from '@/server/services/githubOAuth';

/** Hosted entry used by desktop so one click starts the existing Web OAuth flow. */
export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    const signIn = new URL('/signin', request.nextUrl.origin);
    signIn.searchParams.set('callbackUrl', '/oauth/github/start');
    return NextResponse.redirect(signIn);
  }

  try {
    return NextResponse.redirect(await startGitHubOAuth(session.user.id));
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
