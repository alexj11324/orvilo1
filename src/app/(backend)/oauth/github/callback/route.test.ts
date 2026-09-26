import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, complete } = vi.hoisted(() => ({
  getSession: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/database/server', () => ({ serverDB: {} }));
vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://orvilo.test' } }));
vi.mock('@/server/services/githubOAuth', () => ({ completeGitHubOAuth: complete }));

const { GET } = await import('./route');
const callback = () =>
  new NextRequest('https://orvilo.test/oauth/github/callback?code=abc&state=state');

describe('GitHub OAuth callback session binding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a callback in a browser without an Orvilo session', async () => {
    getSession.mockResolvedValue(null);
    const response = await GET(callback());
    expect(await response.text()).toContain('session_required');
    expect(complete).not.toHaveBeenCalled();
  });

  it('passes the current Better Auth identity to the state validator', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-one' } });
    const request = callback();
    const response = await GET(request);
    expect(getSession).toHaveBeenCalledWith({ headers: request.headers });
    expect(complete).toHaveBeenCalledWith({
      code: 'abc',
      db: {},
      sessionUserId: 'user-one',
      state: 'state',
    });
    expect(await response.text()).toContain('GitHub connected');
  });
});
