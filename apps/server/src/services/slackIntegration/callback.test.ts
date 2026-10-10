import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

import { handleSlackOAuthCallback } from './callback';

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  result: vi.fn(),
  session: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('@/database/server', () => ({ serverDB: {} }));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://orvilo.test' } }));
vi.mock('@/server/services/auth/session', () => ({ resolveAuthSessionFromHeaders: mocks.session }));
vi.mock('./oauthState', () => ({ consumeState: mocks.consume, saveOAuthResult: mocks.result }));
vi.mock('./index', () => ({
  createSlackIntegrationService: () => ({ completeOAuth: mocks.complete }),
}));
const payload = {
  attempt: 'attempt1234567890',
  clientId: 'client',
  redirectUri: 'https://orvilo.test/oauth/slack/callback',
  userId: 'user',
  workspaceId: 'workspace',
  mode: 'workspace',
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.consume.mockResolvedValue(payload);
  mocks.session.mockResolvedValue({ userId: 'user' });
});
it('rejects a different authenticated owner without exchanging code', async () => {
  mocks.session.mockResolvedValue({ userId: 'other' });
  const response = await handleSlackOAuthCallback(
    new NextRequest('https://orvilo.test/oauth/slack/callback?state=nonce&code=code'),
  );
  expect(await response.text()).toContain('slack_session_mismatch');
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.result).toHaveBeenCalledWith(payload, {
    success: false,
    error: 'slack_session_mismatch',
  });
});
it('consumes denied state and records a correlated failure for Electron', async () => {
  const response = await handleSlackOAuthCallback(
    new NextRequest('https://orvilo.test/oauth/slack/callback?state=nonce&error=access_denied'),
  );
  expect(await response.text()).toContain('slack_authorization_denied');
  expect(mocks.result).toHaveBeenCalledWith(payload, {
    success: false,
    error: 'slack_authorization_denied',
  });
  expect(mocks.complete).not.toHaveBeenCalled();
});
it('returns success only after the grant completes and escapes script content', async () => {
  mocks.consume.mockResolvedValue({ ...payload, attempt: '</script><script>alert(1)</script>' });
  const response = await handleSlackOAuthCallback(
    new NextRequest('https://orvilo.test/oauth/slack/callback?state=nonce&code=code'),
  );
  const html = await response.text();
  expect(html).toContain('orvilo-slack-oauth');
  expect(html).toContain('"success":true');
  expect(html).not.toContain('<script>alert(1)</script>');
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('rejects state when the callback browser has no authenticated session', async () => {
  mocks.session.mockResolvedValue(null);
  const response = await handleSlackOAuthCallback(
    new NextRequest('https://orvilo.test/oauth/slack/callback?state=nonce&code=code'),
  );
  expect(await response.text()).toContain('slack_session_mismatch');
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.result).toHaveBeenCalledWith(payload, {
    success: false,
    error: 'slack_session_mismatch',
  });
});
