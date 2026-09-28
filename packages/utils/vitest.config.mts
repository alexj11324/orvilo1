import { join, resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    alias: {
      '@/const': resolve(__dirname, '../const/src'),
      '@/database': resolve(__dirname, '../database/src'),
      '@/envs': resolve(__dirname, '../env/src'),
      '@/server': resolve(__dirname, '../../apps/server/src'),
      '@/utils': resolve(__dirname, './src'),
      '@': resolve(__dirname, '../../src'),
    },
    coverage: {
      reporter: ['text', 'json', 'lcov', 'text-summary'],
    },
    environment: 'happy-dom',
    setupFiles: join(__dirname, './tests/setup.ts'),
  },
});
