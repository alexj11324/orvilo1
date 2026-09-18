import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const normalizePreviewDatabaseUrl = (value, tlsHost) => {
  if (!value || !tlsHost || !/^[a-zA-Z0-9.-]+$/.test(tlsHost)) {
    throw new Error('Preview database URL and certificate hostname are required');
  }
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error('Preview database URL must identify a PostgreSQL database');
  }
  url.hostname = tlsHost;
  url.searchParams.delete('uselibpqcompat');
  url.searchParams.set('sslmode', 'verify-full');
  return url.href;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(normalizePreviewDatabaseUrl(
      process.env.PREVIEW_RESTRICTED_URL, process.env.PREVIEW_DB_TLS_HOST,
    ));
  } catch {
    console.error('Invalid Preview database URL or certificate hostname');
    process.exitCode = 1;
  }
}
