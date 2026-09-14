import { describe, expect, it, vi } from 'vitest';

describe('TWITTER_SITE', () => {
  // These tags go out on every page's share card, so the value has to come from
  // the account the deployment owns. Asserted on a freshly imported module
  // because the constant is derived once, at import time.
  const withSocialX = async (x?: string) => {
    vi.resetModules();
    vi.doMock('@orvilo/business-const', () => ({ SOCIAL_URL: { x } }));
    const { TWITTER_SITE } = await import('./twitter');
    vi.doUnmock('@orvilo/business-const');
    return TWITTER_SITE;
  };

  it('is undefined when the deployment configures no X account', async () => {
    await expect(withSocialX(undefined)).resolves.toBeUndefined();
    await expect(withSocialX('')).resolves.toBeUndefined();
  });

  it('derives the handle from the configured account', async () => {
    await expect(withSocialX('https://x.com/example')).resolves.toBe('@example');
  });
});
