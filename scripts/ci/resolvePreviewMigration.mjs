import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const resolvePreviewMigration = ({ adminUrl, appUrl, ca, tlsHost }) => {
  if (!adminUrl || !appUrl || !ca?.trim()) {
    throw new Error('Preview migration requires admin URL, application URL and pinned CA');
  }
  const admin = new URL(adminUrl);
  const app = new URL(appUrl);
  if (![admin, app].every((url) => ['postgres:', 'postgresql:'].includes(url.protocol))) {
    throw new Error('Preview migration requires PostgreSQL URLs');
  }
  if (tlsHost) admin.hostname = tlsHost;
  if (admin.hostname !== app.hostname || (admin.port || '5432') !== (app.port || '5432')) {
    throw new Error('Preview admin and application URLs must address the same database server');
  }
  const database = decodeURIComponent(app.pathname.slice(1));
  if (
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database) ||
    ['postgres', 'template0', 'template1'].includes(database)
  ) {
    throw new Error('Preview application database must not be a maintenance database');
  }
  admin.pathname = app.pathname;
  // The migration DB factory supplies the pinned CA separately. Do not weaken
  // certificate verification with a connection-string compatibility fallback.
  admin.searchParams.delete('uselibpqcompat');
  admin.searchParams.set('sslmode', 'verify-full');
  return admin.href;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(resolvePreviewMigration({
      adminUrl: process.env.PREVIEW_DB_ADMIN_URL,
      appUrl: process.env.PREVIEW_APP_DATABASE_URL,
      ca: process.env.PREVIEW_DATABASE_SSL_CA,
      tlsHost: process.env.PREVIEW_DB_TLS_HOST,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid Preview migration configuration');
    process.exitCode = 1;
  }
}
