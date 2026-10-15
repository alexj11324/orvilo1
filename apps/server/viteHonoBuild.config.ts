import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { honoServerDedupe, honoServerPlugins } from './viteNodeServer.config';

const serverRoot = fileURLToPath(new URL('.', import.meta.url));
const entry = (file: string) =>
  fileURLToPath(new URL(`./src/router-hono/${file}`, import.meta.url));

export default defineConfig({
  build: {
    emptyOutDir: true,
    minify: false,
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    rollupOptions: {
      input: {
        index: entry('index.ts'),
        standalone: entry('standalone.ts'),
      },
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
        entryFileNames: '[name].js',
        format: 'es',
        // The backend's mutually dependent services must initialize together. Splitting
        // that graph into lazy chunks can call module initializers before assignment.
        manualChunks: (id) =>
          [entry('index.ts'), entry('standalone.ts')].includes(id) ? undefined : 'runtime',
      },
    },
    ssr: true,
    target: 'node24',
  },
  plugins: honoServerPlugins(),
  resolve: {
    dedupe: honoServerDedupe,
  },
  root: serverRoot,
  ssr: {
    // Keep OpenTelemetry singletons in their published runtime modules. Bundling their
    // initializers across application chunks creates initialization-order cycles.
    external: ['@opentelemetry/api'],
    noExternal: [/^@orvilo\//],
  },
});
