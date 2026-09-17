/**
 * node-postgres replaces an explicit `ssl` object when SSL parameters are also
 * present in the connection string. Remove only those parameters when a pinned
 * CA is supplied separately, preserving every other connection option.
 */
export const removeNodePostgresSslParameters = (connectionString: string): string => {
  const url = new URL(connectionString);
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) {
    url.searchParams.delete(key);
  }
  return url.toString();
};

export const resolveNodePostgresConnectionOptions = (
  connectionString: string,
  databaseSslCA: string | undefined,
  vercelEnvironment: string | undefined,
) => {
  if (vercelEnvironment === 'preview' && !databaseSslCA) {
    throw new Error('DATABASE_SSL_CA is required for Vercel Preview PostgreSQL');
  }

  if (!databaseSslCA) return { connectionString };

  return {
    connectionString: removeNodePostgresSslParameters(connectionString),
    ssl: { ca: databaseSslCA, rejectUnauthorized: true as const },
  };
};
