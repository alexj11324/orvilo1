import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  accountId: 'd8f6630c7869111a5139bc5ed4d24ace',
  worker: {
    name: 'orvilo-auth',
    compatibilityDate: '2026-08-01',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: '../workers/app.ts',
    observability: {
      enabled: true,
      headSamplingRate: 1,
      logs: { invocationLogs: false },
    },
    assets: {
      htmlHandling: 'none',
      notFoundHandling: 'none',
      runWorkerFirst: true,
    },
    // Equivalent to the existing Wrangler custom-domain route.
    domains: ['accounts.aspectlylabs.com'],
    env: {
      AUTH_API_BASE: bindings.text('https://orvilo.aspectlylabs.com'),
      AUTH_APP_HOME: bindings.text('https://orvilo.aspectlylabs.com'),
      CLERK_PUBLISHABLE_KEY: bindings.text('pk_live_Y2xlcmsuYXNwZWN0bHlsYWJzLmNvbSQ'),
      PORTAL_PRODUCT_ORIGIN: bindings.text('https://orvilo.aspectlylabs.com'),
      ASSETS: bindings.assets(),
    },
  },
});
