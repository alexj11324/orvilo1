import { getAgentRuntimeRedisClient } from '@/server/modules/AgentExecution/redis';

const key = (state: string) => `github:oauth-state:${state}`;

export interface GitHubOAuthState {
  clientId: string;
  redirectUri: string;
  userId: string;
  verifier: string;
}

export const saveState = async (state: string, payload: GitHubOAuthState): Promise<void> => {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) throw new Error('Redis is required for GitHub OAuth');
  await redis.set(key(state), JSON.stringify(payload), 'EX', 600);
};

export const consumeState = async (state: string): Promise<GitHubOAuthState | null> => {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) return null;
  const raw = await redis.eval(
    `local value = redis.call('get', KEYS[1]);
     if value then redis.call('del', KEYS[1]); end;
     return value;`,
    1,
    key(state),
  );
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    if (
      typeof value.userId !== 'string' ||
      typeof value.clientId !== 'string' ||
      typeof value.redirectUri !== 'string' ||
      typeof value.verifier !== 'string'
    )
      return null;
    return value as unknown as GitHubOAuthState;
  } catch {
    return null;
  }
};
