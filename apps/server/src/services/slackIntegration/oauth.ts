import { z } from 'zod';

import { appEnv } from '@/envs/app';
import { getSlackConfig } from '@/envs/slack';

export const SLACK_BOT_SCOPES = [
  'app_mentions:read',
  'chat:write',
  'channels:read',
  'channels:history',
  'groups:read',
  'groups:history',
  'users:read',
];
export class SlackProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export const getOAuthConfig = () => {
  const env = getSlackConfig();
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET)
    throw new SlackProviderError('slack_not_configured');
  return {
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
    redirectUri: new URL('/oauth/slack/callback', appEnv.APP_URL).toString(),
  };
};
export const slackApi = async (
  method: string,
  token: string,
  params: Record<string, string> = {},
) => {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const body = await response.json();
  if (!response.ok || !body.ok)
    throw new SlackProviderError(
      typeof body.error === 'string' && /^[a-z_]+$/.test(body.error)
        ? body.error
        : 'slack_request_failed',
    );
  return body;
};
const grantSchema = z.object({
  ok: z.literal(true),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
  bot_user_id: z.string().optional(),
  scope: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  team: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  authed_user: z.object({
    id: z.string().min(1),
    access_token: z.string().optional(),
    scope: z.string().optional(),
  }),
});
export const exchangeCode = async (code: string, redirectUri: string) => {
  const config = getOAuthConfig();
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok)
    throw new SlackProviderError(
      typeof body.error === 'string' && /^[a-z_]+$/.test(body.error)
        ? body.error
        : 'slack_exchange_failed',
    );
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) throw new SlackProviderError('slack_invalid_grant');
  return parsed.data;
};
