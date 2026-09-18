import { describe, expect, it } from 'vitest';

import {
  removeNodePostgresSslParameters,
  resolveNodePostgresConnectionOptions,
} from './connection-string';

describe('removeNodePostgresSslParameters', () => {
  it('removes URL SSL overrides while preserving other parameters and credentials', () => {
    expect(
      removeNodePostgresSslParameters(
        'postgresql://user:p%40ss@example.com/db?sslmode=require&uselibpqcompat=true&connect_timeout=10',
      ),
    ).toBe('postgresql://user:p%40ss@example.com/db?connect_timeout=10');
  });
});

describe('resolveNodePostgresConnectionOptions', () => {
  const connectionString =
    'postgresql://user:p%40ss@example.com/db?sslmode=require&uselibpqcompat=true&connect_timeout=10';

  it('requires a pinned CA for Vercel Preview', () => {
    expect(() =>
      resolveNodePostgresConnectionOptions(connectionString, undefined, 'preview'),
    ).toThrow('DATABASE_SSL_CA is required for Vercel Preview PostgreSQL');
  });

  it('pins the supplied CA and removes conflicting URL SSL parameters', () => {
    expect(resolveNodePostgresConnectionOptions(connectionString, 'preview-ca', 'preview')).toEqual(
      {
        connectionString: 'postgresql://user:p%40ss@example.com/db?connect_timeout=10',
        ssl: { ca: 'preview-ca', rejectUnauthorized: true },
      },
    );
  });

  it('preserves the existing connection outside Preview when no CA is supplied', () => {
    expect(resolveNodePostgresConnectionOptions(connectionString, undefined, 'production')).toEqual(
      {
        connectionString,
      },
    );
  });
});
