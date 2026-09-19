// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { marketRouter } from './index';

// Keep the import graph hermetic: `serverDatabase` pulls the DB adaptor and the
// market services pull `next/server`, none of which are needed to inspect the
// router record.
vi.mock('@/libs/trpc/lambda/middleware', () => ({
  marketSDK: vi.fn(function (opts: any) {
    return opts.next({ ctx: { ...opts.ctx, marketSDK: {} } });
  }),
  marketUserInfo: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
  requireMarketAuth: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
  serverDatabase: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
}));

vi.mock('@/server/services/discover', () => ({
  DiscoverService: vi.fn(),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn(),
}));

vi.mock('@/database/models/user', () => ({
  UserModel: vi.fn(),
}));

vi.mock('@/libs/trusted-client', () => ({
  generateTrustedClientToken: vi.fn(function () {
    return 'trust-token';
  }),
}));

vi.mock('@/locales/resources', () => ({
  normalizeLocale: vi.fn((locale: string) => locale),
}));

describe('marketRouter', () => {
  it('does not expose the retired community social routers', () => {
    expect(marketRouter._def.record).not.toHaveProperty('social');
    expect(marketRouter._def.record).not.toHaveProperty('socialProfile');
  });

  it('keeps the remaining market sub-routers mounted', () => {
    for (const key of ['agent', 'agentGroup', 'creds', 'deployments', 'oidc', 'user']) {
      expect(marketRouter._def.record).toHaveProperty(key);
    }

    // The platform skill market was retired with the Skill-management chain.
    expect(marketRouter._def.record).not.toHaveProperty('skill');
  });
});
