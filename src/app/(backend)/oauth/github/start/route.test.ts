import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { getSession, start } = vi.hoisted(() => ({
  getSession: vi.fn(),
  start: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('@/server/services/githubOAuth', () => ({ startGitHubOAuth: start }));

describe('GitHub OAuth hosted start route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects a signed-in browser directly into the existing OAuth flow', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-1' } });
    start.mockResolvedValue('https://github.com/login/oauth/authorize?state=once');

    const response = await GET(new NextRequest('https://orvilo.test/oauth/github/start'));

    expect(start).toHaveBeenCalledWith('user-1');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://github.com/login/oauth/authorize?state=once',
    );
  });

  it('returns through sign-in when the system browser has no Web session', async () => {
    getSession.mockResolvedValue(null);

    const response = await GET(new NextRequest('https://orvilo.test/oauth/github/start'));

    expect(start).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://orvilo.test/signin?callbackUrl=%2Foauth%2Fgithub%2Fstart',
    );
  });
});
