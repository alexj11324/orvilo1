import { afterEach, describe, expect, it, vi } from 'vitest';

import { trpc } from '@/libs/trpc/lambda/init';
import { marketSDK } from '@/libs/trpc/lambda/middleware/marketSDK';

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn(),
  isTrustedClientEnabled: vi.fn(() => false),
}));
vi.mock('@lobehub/market-sdk', () => ({ MarketSDK: class {} }));

afterEach(() => vi.unstubAllEnvs());

describe('Market deployment availability', () => {
  it('returns a stable unavailable code before invoking an unconfigured Market', async () => {
    vi.stubEnv('MARKET_BASE_URL', undefined);
    const called = vi.fn(() => 'called');
    const caller = trpc
      .router({ probe: trpc.procedure.use(marketSDK).query(called) })
      .createCaller({} as any);
    await expect(caller.probe()).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      cause: { data: { code: 'MARKET_UNAVAILABLE' } },
    });
    expect(called).not.toHaveBeenCalled();
  });
});
