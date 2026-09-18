export const PREVIEW_DATABASE_POOL_MAX = 2;

export const resolveNodePostgresPoolMax = (vercelEnvironment?: string): number | undefined =>
  vercelEnvironment === 'preview' ? PREVIEW_DATABASE_POOL_MAX : undefined;
