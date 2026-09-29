import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: path.resolve(import.meta.dirname, '../build/client'),
  plugins: [cloudflare()],
  resolve: { tsconfigPaths: true },
  server: { host: '127.0.0.1', port: 8787, strictPort: true },
});
