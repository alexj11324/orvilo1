import { z } from 'zod';

import { getAgentRuntimeRedisClient } from '@/server/modules/AgentExecution/redis';

const schema = z.object({
  attempt: z.string(),
  clientId: z.string(),
  redirectUri: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  mode: z.enum(['workspace', 'personal']),
  installationId: z.string().optional(),
  tokenRevision: z.string().optional(),
  teamId: z.string().optional(),
});
export type SlackOAuthState = z.infer<typeof schema>;
const key = (state: string) => `slack:oauth-state:${state}`;
const resultKey = (p: Pick<SlackOAuthState, 'workspaceId' | 'userId' | 'attempt'>) =>
  `slack:oauth-result:${p.workspaceId}:${p.userId}:${p.attempt}`;
export const saveState = async (state: string, payload: SlackOAuthState) => {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) throw new Error('slack_redis_required');
  await redis.set(key(state), JSON.stringify(payload), 'EX', 600);
};
export const consumeState = async (state: string): Promise<SlackOAuthState | null> => {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) return null;
  const raw = await redis.eval(
    "local v = redis.call('get', KEYS[1]); if v then redis.call('del', KEYS[1]); end; return v;",
    1,
    key(state),
  );
  try {
    return schema.parse(JSON.parse(String(raw)));
  } catch {
    return null;
  }
};
export const saveOAuthResult = async (
  payload: SlackOAuthState,
  result: { success: boolean; error?: string },
) => {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) throw new Error('slack_redis_required');
  await redis.set(resultKey(payload), JSON.stringify(result), 'EX', 600);
};
export const readOAuthResult = async (
  payload: Pick<SlackOAuthState, 'workspaceId' | 'userId' | 'attempt'>,
) => {
  const raw = await getAgentRuntimeRedisClient()?.get(resultKey(payload));
  if (!raw) return null;
  return z.object({ success: z.boolean(), error: z.string().optional() }).parse(JSON.parse(raw));
};
