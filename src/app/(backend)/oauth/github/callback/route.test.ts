import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveSession, complete, peekState } = vi.hoisted(() => ({
  complete: vi.fn(),
  peekState: vi.fn().mockResolvedValue(null),
  resolveSession: vi.fn(),
}));

vi.mock('@/server/services/auth/session', () => ({
  resolveAuthSessionFromHeaders: resolveSession,
}));
vi.mock('@/database/server', () => ({ serverDB: {} }));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://orvilo.test' } }));
vi.mock('@/server/services/githubOAuth', () => ({
  completeGitHubOAuth: complete,
  peekState,
}));

const { GET } = await import('./route');
const callback = () =>
  new NextRequest('https://orvilo.test/oauth/github/callback?code=abc&state=state');

describe('GitHub OAuth callback session binding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a callback in a browser without an Orvilo session', async () => {
    resolveSession.mockResolvedValue(null);
    const response = await GET(callback());
    expect(await response.text()).toContain('session_required');
    expect(complete).not.toHaveBeenCalled();
  });

  it('passes the current web session identity to the state validator', async () => {
    resolveSession.mockResolvedValue({ userId: 'user-one' });
    const request = callback();
    const response = await GET(request);
    expect(resolveSession).toHaveBeenCalledWith({}, request.headers);
    expect(complete).toHaveBeenCalledWith({
      code: 'abc',
      db: {},
      sessionUserId: 'user-one',
      state: 'state',
    });
    expect(await response.text()).toContain('GitHub connected');
  });
});
