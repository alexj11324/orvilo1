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
    'postgresql://u:p@[::ffff:127.0.0.1]:5432/test', // IPv4-mapped loopback
    'postgresql://postgres:postgres@localhost.:5432/postgres', // trailing root dot
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
    'postgresql://u:p@[2001:db8::10]:5432/app', // remote IPv6 — no dot, must not pass as a "single-label name"
    'postgresql://u:p@[fd00::10]:5432/app', // private ULA IPv6
    'postgresql://u:p@[fe80::1]:5432/app', // link-local IPv6
    'postgresql://u:p@[::ffff:203.0.113.7]:5432/app', // IPv4-mapped remote
    'postgresql://u:p@0.0.0.0:5432/app', // wildcard, not a loopback target
    'postgresql://u:p@192.168.1.10:5432/app', // private IPv4
    'postgresql://u:p@169.254.1.1:5432/app', // link-local IPv4
  ])('rejects a shared or production host: %s', (url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow('Refusing to run tests');
  });

  it.each([
    'http://127.0.0.1:5432/app',
    'mysql://u:p@127.0.0.1:3306/app',
    'not a url at all',
    'postgresql://u:p@[::1:5432/app', // malformed IPv6 bracket
  ])('rejects a non-PostgreSQL or unparseable URL: %s', (url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow('Refusing to run tests');
  });

  it('honors the explicit non-local override', () => {
    process.env.ALLOW_NONLOCAL_TEST_DB = '1';
    expect(() =>
      assertTestDatabaseUrl('postgresql://u:p@prod-db.example.com:5432/app'),
    ).not.toThrow();
  });
});
