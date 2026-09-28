import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // `@orvilo/context-engine` (pulled in transitively) reaches
    // `@orvilo/agent-templates` and its `.md` prompt files.
    // Vitest would otherwise try to parse the Markdown as JavaScript. Mirrors
    // the root config's `raw-md` plugin; the content is irrelevant to the CLI.
    {
      name: 'raw-md',
      transform(_code: string, id: string) {
        if (id.endsWith('.md')) return { code: 'export default ""', map: null };
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: '@orvilo/device-gateway-client',
        replacement: path.resolve(__dirname, '../../packages/device-gateway-client/src/index.ts'),
      },
      {
        find: /^@orvilo\/local-file-shell$/,
        replacement: path.resolve(__dirname, '../../packages/local-file-shell/src/index.ts'),
      },
      {
        find: '@orvilo/file-loaders',
        replacement: path.resolve(__dirname, '../../packages/file-loaders/src/index.ts'),
      },
      {
        find: '@orvilo/tool-runtime',
        replacement: path.resolve(__dirname, '../../packages/tool-runtime/src/index.ts'),
      },
    ],
  },
  test: {
    coverage: {
      reporter: ['text', 'json', 'lcov', 'text-summary'],
    },
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Suppress unhandled rejection warnings from Commander async actions with mocked process.exit
    onConsoleLog: () => true,
  },
});
