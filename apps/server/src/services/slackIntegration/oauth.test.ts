import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { getOAuthConfig } from './oauth';

vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'http://localhost:31784' } }));

beforeEach(() => {
  vi.stubEnv('SLACK_CLIENT_ID', 'client');
  vi.stubEnv('SLACK_CLIENT_SECRET', 'secret');
  vi.stubEnv('SLACK_REDIRECT_URI', '');
});

afterEach(() => vi.unstubAllEnvs());

it('uses the application callback by default', () => {
  expect(getOAuthConfig().redirectUri).toBe('http://localhost:31784/oauth/slack/callback');
});

it('uses a separate Slack callback without changing the application identity URL', () => {
  vi.stubEnv('SLACK_REDIRECT_URI', 'https://slack-qa.example/oauth/slack/callback');

  expect(getOAuthConfig().redirectUri).toBe('https://slack-qa.example/oauth/slack/callback');
});
