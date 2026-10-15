import { createIoRedisState } from '@chat-adapter/state-ioredis';
import type Redis from 'ioredis';

import { getAgentRuntimeRedisClient } from '@/server/modules/AgentExecution/redis';

/** Reuse runtime Redis; shutting down an SDK instance must not close the shared client. */
export function createSlackChatStore(
  installationId: string,
  redis: Redis | null = getAgentRuntimeRedisClient(),
) {
  if (!redis) throw new Error('Redis is required for Slack Chat SDK');
  const prefix = `slack:channels:${encodeURIComponent(installationId)}`;
  const store = createIoRedisState({ client: redis, keyPrefix: prefix });
  const get = store.get.bind(store);
  store.get = async <T>(id: string) => {
    // Existing response IDs, unresolved runs and native tokens must survive the transport change.
    // Atomically retain expiry, prefer current SDK state, and remove consumed legacy tokens.
    if (id.startsWith('response:') || id.startsWith('native:')) {
      const oldKey = `${prefix}:kv:${id}`;
      await redis.eval(
        `if redis.call('EXISTS', KEYS[1]) == 1 then
          if redis.call('EXISTS', KEYS[2]) == 0 then return redis.call('RENAME', KEYS[1], KEYS[2]) end
          redis.call('DEL', KEYS[1])
        end
        return 0`,
        2,
        oldKey,
        `${prefix}:cache:${id}`,
      );
    }
    return get<T>(id);
  };
  return store;
}
