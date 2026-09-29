import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  accountId: 'd8f6630c7869111a5139bc5ed4d24ace',
  worker: {
    name: process.env.CF_WORKER_NAME || 'orvilo-workbench',
    compatibilityDate: '2026-08-01',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: './workers/app.ts',
    observability: {
      enabled: true,
      headSamplingRate: 1,
      logs: { invocationLogs: false },
    },
    env: {
      WORKBENCH_API_BASE: bindings.text('https://orvilo.aspectlylabs.com'),
      WORKBENCH_APP_HOME: bindings.text('https://orvilo.aspectlylabs.com'),
    },
  },
});
