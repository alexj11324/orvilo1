export async function register() {
  // In local development, write debug logs to logs/server.log
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./libs/debug-file-logger');
  }

  // Resume agent-transfer history backfills interrupted by a restart. The
  // default in-process job driver loses its in-memory running set on restart,
  // so re-arm every pending job at boot. Serverless (Vercel) deployments use
  // a durable-queue driver instead and don't need this hook.
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.DATABASE_URL &&
    !process.env.VERCEL_ENV
  ) {
    void (async () => {
      const [{ getServerDB }, { resumePendingAgentTransferJobs }] = await Promise.all([
        import('@orvilo/database'),
        import('@/business/server/agent-transfer/jobRunner'),
      ]);
      await resumePendingAgentTransferJobs(await getServerDB());
    })().catch((err) => {
      console.error('[Instrumentation] Failed to resume agent-transfer jobs:', err);
    });
  }

  if (process.env.NODE_ENV !== 'production' && !process.env.ENABLE_TELEMETRY_IN_DEV) {
    return;
  }

  const shouldEnable = process.env.ENABLE_TELEMETRY && process.env.NEXT_RUNTIME === 'nodejs';
  if (!shouldEnable) {
    return;
  }

  await import('./instrumentation.node');
}
