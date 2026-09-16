import { describe, expect, it } from 'vitest';

import { PREVIEW_DATABASE_POOL_MAX, resolveNodePostgresPoolMax } from './pool-config';

describe('resolveNodePostgresPoolMax', () => {
  it('limits Preview pools to the shared database budget', () => {
    expect(resolveNodePostgresPoolMax('preview')).toBe(PREVIEW_DATABASE_POOL_MAX);
  });

  it('keeps the default pool size for other environments', () => {
    expect(resolveNodePostgresPoolMax('production')).toBeUndefined();
    expect(resolveNodePostgresPoolMax(undefined)).toBeUndefined();
  });
});
