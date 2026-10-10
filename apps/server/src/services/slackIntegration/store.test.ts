import { randomUUID } from 'node:crypto';

import type { StateStore } from '@copilotkit/channels-core';
import { runStateStoreConformance } from '@copilotkit/channels-core/testing';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSlackChannelsStore } from './store';

vi.mock('@/server/modules/AgentExecution/redis', () => ({
  getAgentRuntimeRedisClient: () => null,
}));

it('requires durable Redis instead of silently losing state on restart', () => {
  expect(() => createSlackChannelsStore('installation', null)).toThrow('Redis is required');
});

// CI provides a disposable Redis service. Never start a local backend for this suite.
describe.skipIf(!process.env.SLACK_REDIS_TEST_URL)('Slack Channels Redis', () => {
  let redis: Redis;
  const scopes = new Map<StateStore, string>();

  beforeAll(async () => {
    redis = new Redis(process.env.SLACK_REDIS_TEST_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
    });
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
  });

  runStateStoreConformance(
    'shared runtime Redis',
    () => {
      const scope = `conformance-${randomUUID()}`;
      const store = createSlackChannelsStore(scope, redis);
      scopes.set(store, scope);
      return store;
    },
    async (store) => {
      const scope = scopes.get(store)!;
      let cursor = '0';
      do {
        const result = await redis.scan(cursor, 'MATCH', `slack:channels:${scope}:*`, 'COUNT', 100);
        cursor = result[0];
        if (result[1].length > 0) await redis.del(...result[1]);
      } while (cursor !== '0');
      scopes.delete(store);
    },
  );

  it('isolates identically named keys between installations and survives a new store instance', async () => {
    const prefix = `isolation-${randomUUID()}`;
    const first = createSlackChannelsStore(`${prefix}-a`, redis);
    const other = createSlackChannelsStore(`${prefix}-b`, redis);
    try {
      await first.kv.set('topic', { id: 'private-topic' });
      expect(await other.kv.get('topic')).toBeUndefined();
      const restarted = createSlackChannelsStore(`${prefix}-a`, redis);
      expect(await restarted.kv.get('topic')).toEqual({ id: 'private-topic' });
    } finally {
      await first.kv.delete('topic');
      await other.kv.delete('topic');
    }
  });
});
