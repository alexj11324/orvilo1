import { randomUUID } from 'node:crypto';

import type { StateStore } from '@copilotkit/channels-core';
import type Redis from 'ioredis';

import { getAgentRuntimeRedisClient } from '@/server/modules/AgentExecution/redis';

const APPEND_LIST = `
redis.call('RPUSH', KEYS[1], ARGV[1])
if tonumber(ARGV[2]) > 0 then redis.call('LTRIM', KEYS[1], -tonumber(ARGV[2]), -1) end
if tonumber(ARGV[3]) > 0 then redis.call('PEXPIRE', KEYS[1], ARGV[3]) end
return redis.call('LLEN', KEYS[1])
`;
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;
const ENQUEUE = `
local length = redis.call('LLEN', KEYS[1])
if tonumber(ARGV[2]) > 0 and length >= tonumber(ARGV[2]) then
  if ARGV[3] == 'drop-newest' then return length end
  redis.call('LPOP', KEYS[1])
end
return redis.call('RPUSH', KEYS[1], ARGV[1])
`;

const encode = (value: unknown) => {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('Slack Channels state must be JSON serializable');
  return json;
};
const decode = <T>(value: string | null): T | undefined =>
  value === null ? undefined : (JSON.parse(value) as T);

/** Uses the existing runtime Redis connection; no in-memory production fallback. */
export function createSlackChannelsStore(
  installationId: string,
  redis: Redis | null = getAgentRuntimeRedisClient(),
): StateStore {
  if (!redis) throw new Error('Redis is required for Slack Channels');
  const client = redis;
  const key = (kind: string, value: string) =>
    `slack:channels:${encodeURIComponent(installationId)}:${kind}:${value}`;

  return {
    kv: {
      get: async <T>(id: string) => decode<T>(await client.get(key('kv', id))),
      set: async (id, value, ttlMs) => {
        if (ttlMs) await client.set(key('kv', id), encode(value), 'PX', ttlMs);
        else await client.set(key('kv', id), encode(value));
      },
      delete: async (id) => {
        await client.del(key('kv', id));
      },
      consume: async <T>(id: string) => decode<T>(await client.getdel(key('kv', id))),
    },
    list: {
      append: async (id, value, opts) =>
        Number(
          await client.eval(
            APPEND_LIST,
            1,
            key('list', id),
            encode(value),
            opts?.maxLen ?? 0,
            opts?.ttlMs ?? 0,
          ),
        ),
      range: async <T>(id: string, start = 0, stop = -1) =>
        (await client.lrange(key('list', id), start, stop)).map((value) => JSON.parse(value) as T),
      trim: async (id, maxLen) => {
        if (maxLen <= 0) await client.del(key('list', id));
        else await client.ltrim(key('list', id), -maxLen, -1);
      },
      delete: async (id) => {
        await client.del(key('list', id));
      },
    },
    lock: {
      acquire: async (id, opts) => {
        const token = randomUUID();
        const acquired = await client.set(
          key('lock', id),
          token,
          'PX',
          opts?.ttlMs ?? 30_000,
          'NX',
        );
        return acquired === 'OK' ? { token } : null;
      },
      release: async (id, token) => {
        await client.eval(RELEASE_LOCK, 1, key('lock', id), token);
      },
    },
    dedup: {
      seen: async (id, ttlMs) =>
        (await client.set(key('dedup', id), '1', 'PX', ttlMs, 'NX')) !== 'OK',
    },
    // Channels requires queue primitives; Hatchet owns job delivery, not this list.
    queue: {
      enqueue: async (id, value, opts) =>
        Number(
          await client.eval(
            ENQUEUE,
            1,
            key('queue', id),
            encode(value),
            opts?.maxSize ?? 0,
            opts?.onFull ?? 'drop-oldest',
          ),
        ),
      dequeue: async <T>(id: string) => decode<T>(await client.lpop(key('queue', id))),
      depth: async (id) => client.llen(key('queue', id)),
    },
  };
}
