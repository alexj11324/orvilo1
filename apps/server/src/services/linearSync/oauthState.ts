import { getAgentRuntimeRedisClient } from '@/server/modules/AgentExecution/redis';

const STATE_TTL_SECONDS = 600;
const KEY_PREFIX = 'linear:oauth-state:';

const stateKey = (state: string): string => `${KEY_PREFIX}${state}`;

export interface LinearOAuthStatePayload {
  actor: 'app';
  clientId: string;
  codeVerifier: string;
  lobeUserId: string;
  redirectUri: string;
  returnTo?: string;
  scopes: string[];
  ts: number;
  workspaceId: string;
}

export const saveLinearOAuthState = async (
  state: string,
  payload: Omit<LinearOAuthStatePayload, 'ts'>,
): Promise<void> => {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) throw new Error('Redis is required for Linear OAuth state storage');

  await redis.set(
    stateKey(state),
    JSON.stringify({ ...payload, ts: Date.now() } satisfies LinearOAuthStatePayload),
    'EX',
    STATE_TTL_SECONDS,
  );
};

/** Consume state and delete it in one Redis script so callback replay is rejected. */
export const consumeLinearOAuthState = async (
  state: string,
): Promise<LinearOAuthStatePayload | null> => {
  const redis = getAgentRuntimeRedisClient();
  if (!redis) return null;

  const raw = await redis.eval(
    `local value = redis.call('get', KEYS[1]);
     if value then redis.call('del', KEYS[1]); end;
     return value;`,
    1,
    stateKey(state),
  );
  if (typeof raw !== 'string') return null;

  try {
    const parsed = JSON.parse(raw) as LinearOAuthStatePayload;
    if (
      parsed.actor !== 'app' ||
      typeof parsed.clientId !== 'string' ||
      typeof parsed.codeVerifier !== 'string' ||
      typeof parsed.lobeUserId !== 'string' ||
      typeof parsed.redirectUri !== 'string' ||
      !Array.isArray(parsed.scopes) ||
      typeof parsed.workspaceId !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};
