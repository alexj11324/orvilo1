import { beforeEach, expect, it, vi } from 'vitest';

import { consumeState, readOAuthResult, saveOAuthResult, saveState } from './oauthState';

const { values, redis } = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    redis: {
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      get: vi.fn(async (key: string) => values.get(key)),
      eval: vi.fn(async (_script: string, _n: number, key: string) => {
        const value = values.get(key);
        values.delete(key);
        return value;
      }),
    },
  };
});
vi.mock('@/server/modules/AgentExecution/redis', () => ({
  getAgentRuntimeRedisClient: () => redis,
}));
const payload = {
  attempt: 'attempt1234567890',
  clientId: 'client',
  redirectUri: 'https://orvilo.test/oauth/slack/callback',
  userId: 'user',
  workspaceId: 'workspace',
  mode: 'workspace' as const,
};
beforeEach(() => {
  values.clear();
  vi.clearAllMocks();
});
it('stores expiring state and rejects replay or expired state', async () => {
  await saveState('nonce', payload);
  expect(redis.set).toHaveBeenCalledWith(
    'slack:oauth-state:nonce',
    JSON.stringify(payload),
    'EX',
    600,
  );
  expect(await consumeState('nonce')).toEqual(payload);
  expect(await consumeState('nonce')).toBeNull();
  expect(await consumeState('expired')).toBeNull();
});
it('isolates callback results by user and workspace', async () => {
  await saveOAuthResult(payload, { success: true });
  expect(await readOAuthResult(payload)).toEqual({ success: true });
  expect(await readOAuthResult({ ...payload, workspaceId: 'other' })).toBeNull();
  expect(await readOAuthResult({ ...payload, userId: 'other' })).toBeNull();
});
