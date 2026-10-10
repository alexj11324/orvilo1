import { type NextRequest, NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { appEnv } from '@/envs/app';
import { resolveAuthSessionFromHeaders } from '@/server/services/auth/session';
import { serializeForHtml as scriptValue } from '@/server/utils/serializeForHtml';

import { createSlackIntegrationService } from './index';
import { SlackProviderError } from './oauth';
import { consumeState, saveOAuthResult } from './oauthState';

export const handleSlackOAuthCallback = async (request: NextRequest) => {
  const state = request.nextUrl.searchParams.get('state');
  const payload = state ? await consumeState(state) : null;
  let success = false;
  let error: string | undefined;
  try {
    if (!payload) throw new SlackProviderError('slack_state_invalid');
    const session = await resolveAuthSessionFromHeaders(serverDB, request.headers);
    if (!session?.userId || session.userId !== payload.userId)
      throw new SlackProviderError('slack_session_mismatch');
    try {
      if (request.nextUrl.searchParams.has('error'))
        throw new SlackProviderError('slack_authorization_denied');
      const code = request.nextUrl.searchParams.get('code');
      if (!code) throw new SlackProviderError('slack_code_missing');
      await createSlackIntegrationService(serverDB).completeOAuth(payload, code);
      success = true;
    } catch (cause) {
      error = cause instanceof SlackProviderError ? cause.code : 'slack_connection_failed';
    }
  } catch (cause) {
    error = cause instanceof SlackProviderError ? cause.code : 'slack_connection_failed';
  }
  if (payload) {
    await saveOAuthResult(payload, { success, error });
  }
  const origin = new URL(appEnv.APP_URL).origin;
  const message = scriptValue({
    type: 'orvilo-slack-oauth',
    success,
    error,
    attempt: payload?.attempt,
  });
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Slack connection</title></head><body><p>${success ? 'Slack connected. You can close this window.' : 'Slack connection failed. Please return to Orvilo and try again.'}</p><script>try{if(window.opener)window.opener.postMessage(${message},${scriptValue(origin)})}catch(e){}setTimeout(()=>window.close(),300)</script></body></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    },
  );
};
