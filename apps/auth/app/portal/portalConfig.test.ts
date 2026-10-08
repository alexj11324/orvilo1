import { afterEach, describe, expect, it, vi } from 'vitest';

import { readPortalConfig } from './portalConfig';

afterEach(() => {
  delete globalThis.__PORTAL_CONFIG__;
  vi.unstubAllEnvs();
});

describe('portal product origin', () => {
  it('uses the explicit development product origin', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PORTAL_PRODUCT_ORIGIN', 'http://localhost:3010');
    expect(readPortalConfig().productOrigin).toBe('http://localhost:3010');
  });

  it('keeps runtime injection authoritative', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PORTAL_PRODUCT_ORIGIN', 'http://localhost:3010');
    globalThis.__PORTAL_CONFIG__ = { productOrigin: 'https://staging.aspectlylabs.com' };
    expect(readPortalConfig().productOrigin).toBe('https://staging.aspectlylabs.com');
  });

  it('ignores the development override in a production build', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_PORTAL_PRODUCT_ORIGIN', 'http://localhost:3010');
    expect(readPortalConfig().productOrigin).toBe('https://orvilo.aspectlylabs.com');
  });
});
