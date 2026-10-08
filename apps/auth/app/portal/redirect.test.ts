import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAccountsReturnUrl, resolveStandaloneReturnUrl } from './redirect';

afterEach(() => vi.unstubAllEnvs());

describe('portal return URLs', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'accepts the configured dev loopback origin %s',
    (host) => {
      vi.stubEnv('DEV', true);
      const origin = `http://${host}:3010`;
      expect(resolveStandaloneReturnUrl(`${origin}/acme/issues?view=board#issue`, origin)).toBe(
        `${origin}/acme/issues?view=board#issue`,
      );
    },
  );

  it.each([
    'http://localhost:3011/acme',
    'http://localhost.evil.example:3010/acme',
    'http://user@localhost:3010/acme',
    ['http://localh', 'ost:3010@evil', '.example/acme'].join(''), // hostile fixture, not a credential
    '//localhost:3010/acme',
    'http://127.0.0.1:3010/acme',
    'https://localhost:3010/acme',
    '/\\evil.example/acme',
  ])('rejects an escape from the configured dev origin: %s', (raw) => {
    vi.stubEnv('DEV', true);
    expect(resolveStandaloneReturnUrl(raw, 'http://localhost:3010')).toBe('http://localhost:3010/');
  });

  it('rejects remote HTTP even in development', () => {
    vi.stubEnv('DEV', true);
    expect(resolveStandaloneReturnUrl('http://remote.example/acme', 'http://remote.example')).toBe(
      'http://remote.example/',
    );
  });

  it('rejects HTTP loopback in a production build', () => {
    vi.stubEnv('DEV', false);
    expect(resolveStandaloneReturnUrl('http://localhost:3010/acme', 'http://localhost:3010')).toBe(
      'http://localhost:3010/',
    );
  });

  it('keeps production HTTPS restricted to the exact configured origin without userinfo', () => {
    vi.stubEnv('DEV', false);
    const origin = 'https://orvilo.aspectlylabs.com';
    expect(resolveStandaloneReturnUrl(`${origin}/acme`, origin)).toBe(`${origin}/acme`);
    for (const raw of ['https://evil.example/acme', 'https://user@orvilo.aspectlylabs.com/acme']) {
      expect(resolveStandaloneReturnUrl(raw, origin)).toBe(`${origin}/`);
    }
    expect(resolveAccountsReturnUrl('/oauth/consent?code=123', origin)).toBe(
      '/oauth/consent?code=123',
    );
    expect(resolveStandaloneReturnUrl('/login', origin)).toBe(`${origin}/`);
  });
});
