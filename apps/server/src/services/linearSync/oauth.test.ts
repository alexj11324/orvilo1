import { describe, expect, it, vi } from 'vitest';

import {
  buildLinearAuthorizationUrl,
  createLinearPkcePair,
  exchangeLinearAuthorizationCode,
  validateLinearOAuthInstallation,
} from './oauth';

describe('Linear OAuth', () => {
  it('builds a server-owned actor=app PKCE URL without a client secret', () => {
    const url = new URL(
      buildLinearAuthorizationUrl({
        clientId: 'linear-client',
        codeChallenge: 'challenge',
        redirectUri: 'https://orvilo.example/oauth/linear/callback',
        scopes: ['read', 'write'],
        state: 'server-state',
      }),
    );

    expect(url.searchParams.get('actor')).toBe('app');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('read,write');
    expect(url.searchParams.get('state')).toBe('server-state');
    expect(url.searchParams.has('client_secret')).toBe(false);
  });

  it('exchanges the callback code with the server-held client secret and verifier', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'access-token',
          expires_in: 86_399,
          refresh_token: 'refresh-token',
          scope: 'read write',
        }),
        { status: 200 },
      ),
    );
    const { challenge, verifier } = createLinearPkcePair();
    expect(challenge).not.toBe(verifier);

    await exchangeLinearAuthorizationCode({
      clientId: 'linear-client',
      clientSecret: 'server-only-secret',
      code: 'authorization-code',
      codeVerifier: verifier,
      fetcher,
      redirectUri: 'https://orvilo.example/oauth/linear/callback',
    });

    const body = fetcher.mock.calls[0][1].body as URLSearchParams;
    expect(body.get('client_secret')).toBe('server-only-secret');
    expect(body.get('code_verifier')).toBe(verifier);
    expect(body.get('code')).toBe('authorization-code');
  });

  it('rejects a token whose viewer belongs to another OAuth client', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            organization: { id: 'org-1', name: 'Acme' },
            viewer: { id: 'app-user-1', name: 'Orvilo', oauthClientId: 'different-client' },
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      validateLinearOAuthInstallation({
        accessToken: 'access-token',
        clientId: 'linear-client',
        fetcher,
      }),
    ).rejects.toThrow('not an app actor');
  });
});
