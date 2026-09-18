// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import { assertTestDatabaseUrl } from '../getTestDB';

afterEach(() => {
  delete process.env.ALLOW_NONLOCAL_TEST_DB;
});

describe('assertTestDatabaseUrl', () => {
  it.each([
    'postgresql://postgres:postgres@localhost:5432/postgres',
    'postgresql://postgres:postgres@127.0.0.1:5432/orvilo_acc',
    'postgresql://postgres:postgres@[::1]:5432/test',
    'postgresql://u:p@postgres:5432/test', // docker-compose service name
    'postgresql://u:p@db.internal:5432/test',
    'postgresql://u:p@host.local:5432/test',
  ])('allows local or docker-internal host: %s', (url) => {
    expect(() => assertTestDatabaseUrl(url)).not.toThrow();
  });

  it.each([
    'postgresql://u:p@prod-db.example.com:5432/app',
    'postgresql://u:p@mydb.abc123.us-east-1.rds.amazonaws.com:5432/app',
    'postgresql://u:p@10.20.30.40:5432/app', // LAN IP — shared host, not loopback
    'postgresql://u:p@orvilo.aspectlylabs.com:5432/app',
  ])('rejects a shared or production host: %s', (url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow('Refusing to run tests');
  });

  it('honors the explicit non-local override', () => {
    process.env.ALLOW_NONLOCAL_TEST_DB = '1';
    expect(() =>
      assertTestDatabaseUrl('postgresql://u:p@prod-db.example.com:5432/app'),
    ).not.toThrow();
  });
});
