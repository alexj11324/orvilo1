import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import dotenv from 'dotenv';

const authRoot = resolve(__dirname, '..');
const repoRoot = resolve(authRoot, '../..');
const assetsDir = resolve(authRoot, 'build/client/assets');

// A host repo that builds this app from a submodule keeps its own .env; it
// points AUTH_ENV_FILE at it so local deploys pick up the same credentials.
dotenv.config({ path: process.env.AUTH_ENV_FILE || resolve(repoRoot, '.env') });

async function main() {
  console.log('=== Step 1: Build auth (same-origin assets) ===');
  // No VITE_CDN_BASE: the worker's assets binding serves /assets/* itself, so
  // chunk URLs must stay same-origin — a CDN URL would need CORS that
  // web-assets.aspectlylabs.com does not send.
  execSync('bun run build', {
    cwd: authRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=8192',
      VITE_CDN_BASE: '/',
    },
    stdio: 'inherit',
  });

  if (!existsSync(assetsDir)) throw new Error(`Build output not found at ${assetsDir}`);

  console.log('\n=== Step 2: Deploy worker ===');
  execSync('node_modules/.bin/wrangler deploy', {
    cwd: authRoot,
    stdio: 'inherit',
  });

  console.log('\n=== Deploy complete ===');
}

main().catch((error) => {
  console.error('Deploy failed:', error);
  process.exit(1);
});
