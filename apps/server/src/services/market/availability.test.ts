import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarketService } from './index';

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn(),
  isTrustedClientEnabled: vi.fn(() => false),
}));
vi.mock('@lobehub/market-sdk', () => ({ MarketSDK: class {} }));

afterEach(() => vi.unstubAllEnvs());

describe('Market deployment availability', () => {
  it('returns a stable unavailable code before invoking an unconfigured Market', () => {
    vi.stubEnv('MARKET_BASE_URL', undefined);
    const service = new MarketService();
    expect(() => service.getSDK()).toThrow(
      expect.objectContaining({
        code: 'SERVICE_UNAVAILABLE',
        cause: expect.objectContaining({ data: { code: 'MARKET_UNAVAILABLE' } }),
      }),
    );
  });
});
