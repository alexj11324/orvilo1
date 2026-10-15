import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after build. pnpm deploy copies only published files and production dependencies,
// so this test cannot accidentally import the repository's source or root node_modules.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const target = await mkdtemp(path.join(tmpdir(), 'orvilo-server-deploy-'));
let child;
try {
  const deployed = spawnSync(
    'pnpm',
    ['--filter', '@orvilo/server', 'deploy', '--legacy', '--frozen-lockfile', '--prod', target],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );
  assert.equal(deployed.status, 0, 'production deployment failed');
  await access(path.join(target, 'dist/standalone.js'));
  await assert.rejects(access(path.join(target, 'src')));

  // Use an unreachable local database, never the developer's configured database.
  child = spawn(process.execPath, ['dist/standalone.js'], {
    cwd: target,
    env: {
      ...process.env,
      DISABLE_REDIS: 'true',
      REDIS_URL: 'redis://127.0.0.1:1',
      HATCHET_CLIENT_TOKEN: '',
      HATCHET_CLIENT_HOST_PORT: '127.0.0.1:1',
      NODE_ENV: 'production',
      HONO_HOST: '127.0.0.1',
      HONO_PORT: '0',
      DATABASE_URL: 'postgresql://smoke:smoke@127.0.0.1:1/smoke',
      DATABASE_DRIVER: 'node',
      KEY_VAULTS_SECRET: Buffer.alloc(32, 7).toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Server did not start:\n${output}`)),
      120_000,
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}:\n${output}`));
    });
    child.stderr.on('data', (data) => {
      output += data;
    });
    child.stdout.on('data', (data) => {
      output += data;
      const match = output.match(/Hono runtime ready at (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  const url = await ready;
  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: '@orvilo/server' });
  console.info('Isolated production server started and /health passed.');
} finally {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolve) => child.once('exit', resolve));
  }
  await rm(target, { recursive: true, force: true });
}
