import { describe, expect, it } from 'vitest';

import { normalizeNodePostgresConnectionString } from './connection-string';

describe('normalizeNodePostgresConnectionString', () => {
  it('adds libpq compatibility for an explicitly allowed Preview URL', () => {
    const connectionString =
      'postgresql://user:pass@example.com:25432/orvilo_preview?sslmode=require';

    expect(normalizeNodePostgresConnectionString(connectionString, true)).toBe(
      `${connectionString}&uselibpqcompat=true`,
    );
  });

  it('preserves existing query parameters and credentials', () => {
    const connectionString =
      'postgresql://user:p%40ss@example.com/db?sslmode=require&connect_timeout=10';

    expect(normalizeNodePostgresConnectionString(connectionString, true)).toBe(
      `${connectionString}&uselibpqcompat=true`,
    );
  });

  it('does not change a disallowed environment or an explicit setting', () => {
    const connectionString = 'postgresql://user:pass@example.com/db?sslmode=require';

    expect(normalizeNodePostgresConnectionString(connectionString)).toBe(connectionString);
    expect(
      normalizeNodePostgresConnectionString(`${connectionString}&uselibpqcompat=false`, true),
    ).toBe(`${connectionString}&uselibpqcompat=false`);
  });
});
