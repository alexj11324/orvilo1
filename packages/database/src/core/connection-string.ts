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
