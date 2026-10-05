import path from 'node:path';

import { defineConfig } from '@playwright/test';

const repository = path.resolve(__dirname, '../..');

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: `${repository}/test-results/ui-alignment`,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: `${repository}/test-results/ui-alignment-report` }],
  ],
  retries: 0,
  testDir: '.',
  testMatch: 'alignment.spec.ts',
  use: {
    baseURL: 'http://127.0.0.1:5188',
    browserName: 'chromium',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite --config tests/ui-alignment/vite.config.ts',
    cwd: repository,
    reuseExistingServer: !process.env.CI,
    url: 'http://127.0.0.1:5188',
  },
});
