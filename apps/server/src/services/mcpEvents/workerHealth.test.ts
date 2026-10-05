// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMcpEventWorkerHealth, recordMcpEventWorkerHealth } from './workerHealth';

const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), client: vi.fn() }));
vi.mock('@/envs/redis', () => ({ redisEnv: { REDIS_PREFIX: 'test' } }));
vi.mock('@/server/modules/AgentExecution/redis', () => ({
  getAgentRuntimeRedisClient: mocks.client,
}));

describe('MCP worker observed readiness', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    mocks.client.mockReturnValue({ get: mocks.get, set: mocks.set });
  });
  afterEach(() => vi.useRealTimers());

  it('records an expiring observation and rejects stale or future observations', async () => {
    await recordMcpEventWorkerHealth('ready');
    expect(mocks.set).toHaveBeenCalledWith(
      'test:mcp-events:worker-health',
      JSON.stringify({ observedAt: 1000, status: 'ready' }),
      'EX',
      180,
    );
    mocks.get.mockResolvedValue(JSON.stringify({ observedAt: 1000, status: 'ready' }));
    expect(await getMcpEventWorkerHealth()).toEqual({ observedAt: 1000, status: 'ready' });
    vi.setSystemTime(181_000);
    expect(await getMcpEventWorkerHealth()).toEqual({ status: 'unknown' });
    mocks.get.mockResolvedValue(JSON.stringify({ observedAt: 182_000, status: 'ready' }));
    expect(await getMcpEventWorkerHealth()).toEqual({ status: 'unknown' });
  });

  it('does not infer readiness from configuration or unavailable observation storage', async () => {
    mocks.client.mockReturnValue(null);
    expect(await getMcpEventWorkerHealth()).toEqual({ status: 'unknown' });
    mocks.client.mockReturnValue({ get: mocks.get, set: mocks.set });
    mocks.get.mockRejectedValue(new Error('offline'));
    expect(await getMcpEventWorkerHealth()).toEqual({ status: 'unavailable' });
    mocks.set.mockRejectedValue(new Error('offline'));
    await expect(recordMcpEventWorkerHealth('unavailable')).resolves.toBeUndefined();
  });

  it('returns the latest observed execution failure', async () => {
    mocks.get.mockResolvedValue(JSON.stringify({ observedAt: 1000, status: 'unavailable' }));
    expect(await getMcpEventWorkerHealth()).toEqual({ observedAt: 1000, status: 'unavailable' });
  });
});
