import { describe, expect, it, vi } from 'vitest';

import { consumeLinearOAuthState, saveLinearOAuthState } from './oauthState';

const redis = vi.hoisted(() => ({ eval: vi.fn(), set: vi.fn() }));

vi.mock('@/server/modules/AgentExecution/redis', () => ({
  getAgentRuntimeRedisClient: () => redis,
}));

describe('Linear OAuth state', () => {
  it('binds workspace/user/PKCE data server-side and consumes it once', async () => {
    await saveLinearOAuthState('state-1', {
      actor: 'app',
      clientId: 'client-1',
      codeVerifier: 'verifier-1',
      lobeUserId: 'user-1',
      redirectUri: 'https://orvilo.example/oauth/linear/callback',
      scopes: ['read', 'write'],
      workspaceId: 'workspace-1',
    });

    expect(redis.set).toHaveBeenCalledWith(
      'linear:oauth-state:state-1',
      expect.stringContaining('workspace-1'),
      'EX',
      600,
    );

    redis.eval.mockResolvedValueOnce(
      JSON.stringify({
        actor: 'app',
        clientId: 'client-1',
        codeVerifier: 'verifier-1',
        lobeUserId: 'user-1',
        redirectUri: 'https://orvilo.example/oauth/linear/callback',
        scopes: ['read', 'write'],
        ts: Date.now(),
        workspaceId: 'workspace-1',
      }),
    );
    await expect(consumeLinearOAuthState('state-1')).resolves.toMatchObject({
      clientId: 'client-1',
      codeVerifier: 'verifier-1',
      lobeUserId: 'user-1',
      workspaceId: 'workspace-1',
    });

    redis.eval.mockResolvedValueOnce(null);
    await expect(consumeLinearOAuthState('state-1')).resolves.toBeNull();
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('del', KEYS[1])"),
      1,
      'linear:oauth-state:state-1',
    );
  });
});
