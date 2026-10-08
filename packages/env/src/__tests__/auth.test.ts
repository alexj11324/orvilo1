import { afterEach, expect, it, vi } from 'vitest';

import { getAuthConfig } from '../auth';

afterEach(() => vi.unstubAllEnvs());

it.each(['1garbage', '1.5', '0', '-1', '2592001', 'Infinity'])(
  'rejects malformed or unbounded idle TTL %s',
  (ttl) => {
    vi.stubEnv('AUTH_SESSION_TTL_SECONDS', ttl);
    expect(() => getAuthConfig()).toThrow();
  },
);
it.each(['1', '604800', '2592000'])('retains valid idle configuration %s', (ttl) => {
  vi.stubEnv('AUTH_SESSION_TTL_SECONDS', ttl);
  expect(getAuthConfig().AUTH_SESSION_TTL_SECONDS).toBe(Number(ttl));
});
