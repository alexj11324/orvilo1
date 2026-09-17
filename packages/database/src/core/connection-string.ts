/**
 * pg-connection-string keeps the historical `sslmode=require` behaviour only
 * when libpq compatibility is explicitly enabled. The Preview PostgreSQL
 * endpoint uses a self-signed certificate, so preserve TLS while opting into
 * that behaviour when the caller has explicitly allowed it.
 */
export const normalizeNodePostgresConnectionString = (
  connectionString: string,
  allowSelfSignedTls = false,
): string => {
  if (
    !allowSelfSignedTls ||
    !/(?:\?|&)sslmode=require(?:&|$)/.test(connectionString) ||
    /(?:\?|&)uselibpqcompat=/.test(connectionString)
  ) {
    return connectionString;
  }

  return `${connectionString}${connectionString.includes('?') ? '&' : '?'}uselibpqcompat=true`;
};

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
