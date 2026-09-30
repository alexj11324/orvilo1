import { type NextRequest, NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { resolveAuthSessionFromHeaders } from '@/server/services/auth/session';
import { completeGitHubOAuth, peekState } from '@/server/services/githubOAuth';

const scriptValue = (value: unknown): string =>
  JSON.stringify(value).replaceAll(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  );

const resultPage = (
  request: NextRequest,
  success: boolean,
  error?: string,
  attempt?: string,
): NextResponse => {
  const origin = appEnv.APP_URL ? new URL(appEnv.APP_URL).origin : request.nextUrl.origin;
  const message = scriptValue({ type: 'orvilo-github-oauth', success, error, attempt });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>GitHub connection</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;text-align:center">
<p>${success ? 'GitHub connected. You can close this window.' : 'GitHub connection failed. Please try again.'}</p>
<script>(function(){try{if(window.opener)window.opener.postMessage(${message},${scriptValue(origin)});}catch(e){}setTimeout(function(){window.close()},300)})()</script>
</body></html>`;
  return new NextResponse(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
};

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  if (!state) return resultPage(request, false, 'missing_state');
  if (request.nextUrl.searchParams.has('error'))
    return resultPage(request, false, 'authorization_denied');
  if (!code) return resultPage(request, false, 'missing_code');
  // Read (without consuming) the state so the attempt nonce echoes on every
  // result — including failures where the grant never completes.
  const attempt = (await peekState(state))?.attempt;
  try {
    const session = await resolveAuthSessionFromHeaders(serverDB, request.headers);
    if (!session?.userId) return resultPage(request, false, 'session_required', attempt);
    await completeGitHubOAuth({ code, db: serverDB, sessionUserId: session.userId, state });
    return resultPage(request, true, undefined, attempt);
  } catch (error) {
    console.error(
      '[githubOAuth:callback]',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return resultPage(request, false, 'connection_failed', attempt);
  }
};
