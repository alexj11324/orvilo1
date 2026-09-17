import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentRuntimeRedisClient } from './redis';

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: class {
    on = vi.fn();

    constructor(url: string, options: unknown) {
      mocks.constructor(url, options);
    }
  },
}));

vi.mock('@/envs/redis', () => ({
  getRedisConfig: () => ({ prefix: 'lobechat', tls: true, tlsCA: 'preview-ca' }),
  redisEnv: { REDIS_URL: 'rediss://default:secret@example.com:26380' },
}));

vi.mock('@/libs/redis', () => ({
  isRedisDisabledByEnv: () => false,
}));

describe('createAgentRuntimeRedisClient', () => {
  afterEach(() => {
    delete process.env.AGENT_RUNTIME_REDIS_PREFIX;
    mocks.constructor.mockClear();
  });

  it('preserves the legacy unprefixed keyspace when the opt-in is absent', () => {
    createAgentRuntimeRedisClient();

    expect(mocks.constructor).toHaveBeenCalledWith(
      'rediss://default:secret@example.com:26380',
      expect.objectContaining({ keyPrefix: undefined, tls: { ca: 'preview-ca' } }),
    );
  });

  it('uses an explicit environment-specific prefix', () => {
    process.env.AGENT_RUNTIME_REDIS_PREFIX = 'orvilo-preview';

    createAgentRuntimeRedisClient();

    expect(mocks.constructor).toHaveBeenCalledWith(
      'rediss://default:secret@example.com:26380',
      expect.objectContaining({ keyPrefix: 'orvilo-preview:' }),
    );
  });
});
