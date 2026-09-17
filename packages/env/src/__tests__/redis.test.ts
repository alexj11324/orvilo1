// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRedisEnv } from '../redis';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getRedisEnv', () => {
  it('normalizes escaped newlines in a pinned Redis TLS CA', () => {
    vi.stubEnv('REDIS_TLS', 'true');
    vi.stubEnv('REDIS_TLS_CA', '-----BEGIN CERTIFICATE-----\\nbody\\n-----END CERTIFICATE-----');

    expect(getRedisEnv()).toMatchObject({
      REDIS_TLS: true,
      REDIS_TLS_CA: '-----BEGIN CERTIFICATE-----\nbody\n-----END CERTIFICATE-----',
    });
  });

  it('keeps the TLS CA optional for non-TLS Redis deployments', () => {
    vi.stubEnv('REDIS_TLS', undefined);
    vi.stubEnv('REDIS_TLS_CA', undefined);

    expect(getRedisEnv()).toMatchObject({ REDIS_TLS: false, REDIS_TLS_CA: undefined });
  });
});
