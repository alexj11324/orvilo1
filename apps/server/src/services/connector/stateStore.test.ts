import { beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeConnectorOAuthState, saveConnectorOAuthState } from './stateStore';

const redis = vi.hoisted(() => ({ eval: vi.fn(), set: vi.fn() }));

vi.mock('@/server/modules/AgentExecution/redis', () => ({
  getAgentRuntimeRedisClient: () => redis,
}));

describe('connector OAuth state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('binds the initiation workspace and consumes the payload atomically', async () => {
    await saveConnectorOAuthState('state-1', {
      authorizationServerUrl: 'https://auth.example.com',
      codeVerifier: 'verifier-1',
      connectorId: 'connector-1',
      orviloUserId: 'user-1',
      workspaceId: 'workspace-1',
    });

    expect(redis.set).toHaveBeenCalledWith(
      'connector:oauth-state:state-1',
      expect.stringContaining('workspace-1'),
      'EX',
      600,
    );

    redis.eval.mockResolvedValueOnce(
      JSON.stringify({
        authorizationServerUrl: 'https://auth.example.com',
        codeVerifier: 'verifier-1',
        connectorId: 'connector-1',
        orviloUserId: 'user-1',
        ts: Date.now(),
        workspaceId: 'workspace-1',
      }),
    );
    await expect(consumeConnectorOAuthState('state-1')).resolves.toMatchObject({
      connectorId: 'connector-1',
      workspaceId: 'workspace-1',
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('del', KEYS[1])"),
      1,
      'connector:oauth-state:state-1',
    );
  });
});
