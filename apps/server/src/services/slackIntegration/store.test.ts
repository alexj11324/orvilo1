import { randomUUID } from 'node:crypto';

import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createSlackChatStore } from './store';

vi.mock('@/server/modules/AgentExecution/redis', () => ({
  getAgentRuntimeRedisClient: () => null,
}));

it('requires durable Redis instead of silently losing state on restart', () => {
  expect(() => createSlackChatStore('installation', null)).toThrow('Redis is required');
});

// CI provides disposable Redis; this suite never starts an application backend.
describe.skipIf(!process.env.SLACK_REDIS_TEST_URL)('Chat SDK shared runtime Redis', () => {
  let redis: Redis;
  const prefix = `slack-test-${randomUUID()}`;

  beforeAll(async () => {
    redis = new Redis(process.env.SLACK_REDIS_TEST_URL!, { maxRetriesPerRequest: 0 });
    await new Promise<void>((resolve) => redis.once('ready', resolve));
  });

  afterAll(async () => {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `slack:channels:${prefix}*`,
        'COUNT',
        100,
      );
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
    await redis.quit();
  });

  it('isolates installations, survives recreation and leaves the shared connection open', async () => {
    const first = createSlackChatStore(`${prefix}-a`, redis);
    const other = createSlackChatStore(`${prefix}-b`, redis);
    await first.connect();
    await other.connect();
    await first.set('topic', { id: 'private-topic' });
    expect(await other.get('topic')).toBeNull();
    const restarted = createSlackChatStore(`${prefix}-a`, redis);
    await restarted.connect();
    expect(await restarted.get('topic')).toEqual({ id: 'private-topic' });
    await first.disconnect();
    expect(await redis.ping()).toBe('PONG');
  });

  it('preserves existing response/native state and expiry without reviving consumed tokens', async () => {
    const installation = `${prefix}-legacy`;
    const store = createSlackChatStore(installation, redis);
    await store.connect();
    const response = 'response:["installation","C1::1.0","human","workspace","agent"]';
    const token = 'native:["installation","C1::1.0","workspace","agent"]:token';
    for (const id of [response, token]) {
      await redis.set(
        `slack:channels:${installation}:kv:${id}`,
        JSON.stringify({ pending: true }),
        'PX',
        60_000,
      );
      expect(await store.get(id)).toEqual({ pending: true });
      const ttl = await redis.pttl(`slack:channels:${installation}:cache:${id}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);
      await store.delete(id);
      expect(await store.get(id)).toBeNull();
    }
    await store.set(response, { pending: false, responseId: 'new' });
    await redis.set(`slack:channels:${installation}:kv:${response}`, '{"pending":true}');
    expect(await store.get(response)).toEqual({ pending: false, responseId: 'new' });
    await store.delete(response);
    expect(await store.get(response)).toBeNull();
  });

  it('uses native atomic deduplication and token-owned distributed locks', async () => {
    const first = createSlackChatStore(`${prefix}-locks`, redis);
    const second = createSlackChatStore(`${prefix}-locks`, redis);
    await Promise.all([first.connect(), second.connect()]);
    expect(
      await Promise.all([
        first.setIfNotExists('event', true),
        second.setIfNotExists('event', true),
      ]),
    ).toEqual([true, false]);
    const lock = await first.acquireLock('thread', 30_000);
    expect(lock).not.toBeNull();
    expect(await second.acquireLock('thread', 30_000)).toBeNull();
    await second.releaseLock({ ...lock!, token: 'different-owner' });
    expect(await second.acquireLock('thread', 30_000)).toBeNull();
    await first.releaseLock(lock!);
    expect(await second.acquireLock('thread', 30_000)).not.toBeNull();
  });
});
