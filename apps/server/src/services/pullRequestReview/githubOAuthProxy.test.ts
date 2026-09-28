import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitHubOAuthProxy, GitHubAuthorizationExpiredError } from './githubOAuthProxy';

afterEach(() => vi.unstubAllGlobals());

describe('GitHub App review proxy', () => {
  it('keeps the token in the Authorization header on the fixed GitHub API host', async () => {
    const fetchMock = vi.fn(async () => Response.json({ login: 'reviewer' }));
    vi.stubGlobal('fetch', fetchMock);

    const proxy = createGitHubOAuthProxy('private-token');
    await proxy.proxyOAuthRequest({
      endpoint: '/user',
      method: 'GET',
      provider: 'github',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://api.github.com');
    expect(url.toString()).not.toContain('private-token');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer private-token');
    await expect(
      proxy.proxyOAuthRequest({
        endpoint: '//other.example/user',
        method: 'GET',
        provider: 'github',
      }),
    ).rejects.toThrow('Invalid GitHub API endpoint');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a revoked token into the reconnect state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'Bad credentials' }, { status: 401 })),
    );
    const proxy = createGitHubOAuthProxy('revoked-token');
    await expect(
      proxy.proxyOAuthRequest({ endpoint: '/user', method: 'GET', provider: 'github' }),
    ).rejects.toBeInstanceOf(GitHubAuthorizationExpiredError);
  });
});
