import path from 'node:path';

import { defineConfig } from 'vite';

import {
  createSharedRolldownOutput,
  sharedModulePreload,
  sharedOptimizeDeps,
  sharedRendererDedupe,
  sharedRendererDefine,
  sharedRendererPlugins,
} from './plugins/vite/sharedRendererConfig';

/** Static preview of the REAL Web SPA. Never used by a production app build. */
export default defineConfig(({ mode }) => {
  if (mode !== 'ui-preview')
    throw new Error('Use --mode ui-preview for the isolated fixture build.');
  return {
    base: '/',
    build: {
      outDir: 'dist/ui-preview',
      reportCompressedSize: false,
      modulePreload: sharedModulePreload,
      rolldownOptions: {
        input: path.resolve(import.meta.dirname, 'index.html'),
        output: createSharedRolldownOutput({ strictExecutionOrder: true }),
        preserveEntrySignatures: 'allow-extension',
      },
    },
    define: {
      ...sharedRendererDefine({ isElectron: false, isMobile: false }),
      __ORVILO_UI_PREVIEW__: 'true',
    },
    experimental: { bundledDev: false },
    optimizeDeps: sharedOptimizeDeps,
    resolve: { dedupe: sharedRendererDedupe, tsconfigPaths: true },
    plugins: [
      {
        name: 'orvilo-isolated-ui-preview',
        enforce: 'pre',
        resolveId(source, importer) {
          if (
            source === '@/features/Collaboration/connection' ||
            (source === './connection' && importer?.includes('/src/features/Collaboration/'))
          ) {
            return path.resolve(import.meta.dirname, 'src/spa/preview/realtime.ts');
          }
        },
        transformIndexHtml: {
          order: 'pre',
          handler: (html) =>
            html
              .replace('/src/spa/entry.web.tsx', '/src/spa/preview/entry.ts')
              .replace(
                '<!--SEO_META-->',
                '<title>Orvilo · Repository UI preview</title><meta name="robots" content="noindex,nofollow" />',
              )
              .replace(/<link rel="manifest"[^>]*>/, ''),
        },
      },
      ...sharedRendererPlugins({ platform: 'web' }),
    ],
    server: { host: '0.0.0.0', port: 5173, strictPort: true },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: process.env.ORVILO_PREVIEW_HOST ? [process.env.ORVILO_PREVIEW_HOST] : undefined,
    },
  };
});
