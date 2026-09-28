import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/envs/app', () => ({ appEnv: { APP_URL: 'https://orvilo.test' } }));
vi.mock('@/envs/githubApp', () => ({
  githubAppEnv: { GITHUB_APP_CLIENT_ID: 'client', GITHUB_APP_CLIENT_SECRET: 'secret' },
}));

const { refreshToken } = await import('./provider');

describe('GitHub refresh response', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves bad_refresh_token from GitHub even when the HTTP status is 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'bad_refresh_token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(refreshToken('expired')).rejects.toMatchObject({
      code: 'bad_refresh_token',
      status: 200,
    });
  });
});
