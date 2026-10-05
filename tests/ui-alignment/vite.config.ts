import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repository = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  css: { postcss: repository },
  plugins: [react()],
  resolve: { alias: { '@': `${repository}/src` } },
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
});
