import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const prebuild = fileURLToPath(new URL('./dockerPrebuild.mts', import.meta.url));

const run = (extra) => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'orvilo-prebuild-'));
  try {
    // No inherited credentials or local dotenv file; version probes stay offline.
    return spawnSync(process.execPath, ['--experimental-strip-types', prebuild], {
      cwd,
      encoding: 'utf8',
      env: { PATH: '', DATABASE_URL: 'postgres://localhost/example', ...extra },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
};

test('builds without a retired AUTH_SECRET or runtime Clerk credentials', () => {
  const result = run({ KEY_VAULTS_SECRET: 'build-only-placeholder' });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /build-only-placeholder/);
});

test('still rejects a missing key-vault secret for database builds', () => {
  const result = run({});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /KEY_VAULTS_SECRET/);
  assert.doesNotMatch(result.stderr, /rename it to AUTH_SECRET/);
});
