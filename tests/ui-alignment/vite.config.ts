import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repository = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  build: {
    outDir: `${process.env.RUNNER_TEMP ?? `${repository}/node_modules/.cache`}/ui-alignment/alignment`,
    rolldownOptions: {
      input: [
        `${repository}/tests/ui-alignment/index.html`,
        `${repository}/tests/ui-alignment/standaloneTheme.html`,
      ],
    },
  },
  css: { postcss: repository },
  plugins: [react()],
  resolve: { alias: { '@': `${repository}/src` } },
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
});
