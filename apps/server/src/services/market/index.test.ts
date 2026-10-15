// @vitest-environment node
import { MarketSDK } from '@lobehub/market-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateTrustedClientToken } from '@/libs/trusted-client';

import { MarketService } from './index';

const { runBuildInTool } = vi.hoisted(() => ({ runBuildInTool: vi.fn() }));
vi.mock('@lobehub/market-sdk', () => ({
  MarketSDK: vi.fn(function () {
    return { plugins: { runBuildInTool } };
  }),
}));
vi.mock('@/libs/trusted-client', () => ({ generateTrustedClientToken: vi.fn() }));

describe('retained cloud execution transport', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.stubEnv('MARKET_BASE_URL', 'https://market.example.test');
    vi.clearAllMocks();
  });
  describe('constructor', () => {
    it('should create MarketSDK with no options by default', () => {
      new MarketService();
      expect(MarketSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: undefined,
          trustedClientToken: undefined,
        }),
      );
    });

    it('should pass accessToken to MarketSDK', () => {
      new MarketService({ accessToken: 'my-token' });
      expect(MarketSDK).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'my-token' }));
    });

    it('should use provided trustedClientToken directly', () => {
      new MarketService({ trustedClientToken: 'pre-generated-token' });
      expect(MarketSDK).toHaveBeenCalledWith(
        expect.objectContaining({ trustedClientToken: 'pre-generated-token' }),
      );
    });

    it('should generate trustedClientToken from userInfo when no trustedClientToken', () => {
      const userInfo = { userId: 'user-1' } as any;
      (generateTrustedClientToken as any).mockReturnValue('generated-token');

      new MarketService({ userInfo });

      expect(generateTrustedClientToken).toHaveBeenCalledWith(userInfo);
      expect(MarketSDK).toHaveBeenCalledWith(
        expect.objectContaining({ trustedClientToken: 'generated-token' }),
      );
    });

    it('should prefer trustedClientToken over generating from userInfo', () => {
      const userInfo = { userId: 'user-1' } as any;

      new MarketService({ trustedClientToken: 'explicit-token', userInfo });

      expect(generateTrustedClientToken).not.toHaveBeenCalled();
      expect(MarketSDK).toHaveBeenCalledWith(
        expect.objectContaining({ trustedClientToken: 'explicit-token' }),
      );
    });

    it('should pass clientCredentials to MarketSDK', () => {
      new MarketService({
        clientCredentials: { clientId: 'client-id', clientSecret: 'client-secret' },
      });
      expect(MarketSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-id',
          clientSecret: 'client-secret',
        }),
      );
    });
  });

  it('exports an artifact through the same authenticated session', async () => {
    runBuildInTool.mockResolvedValue({ success: true, data: { result: { success: true } } });
    const result = await new MarketService({ accessToken: 'session-token' }).exportFile({
      path: '/workspace/result.txt',
      topicId: 'topic',
      uploadUrl: 'https://files.example/upload',
      userId: 'user',
    });
    expect(result.success).toBe(true);
    expect(runBuildInTool).toHaveBeenCalledWith(
      'exportFile',
      {
        path: '/workspace/result.txt',
        uploadUrl: 'https://files.example/upload',
      },
      { topicId: 'topic', userId: 'user' },
    );
  });

  it('refuses execution transport when the service is not configured', () => {
    vi.stubEnv('MARKET_BASE_URL', undefined);
    expect(() => new MarketService().getSDK()).toThrow('Market is not configured');
    expect(runBuildInTool).not.toHaveBeenCalled();
  });
});
