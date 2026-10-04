import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { parse } from 'yaml';

const exec = promisify(execFile);
const action = parse(
  await readFile(
    new URL('../.github/actions/desktop-notarization/action.yml', import.meta.url),
    'utf8',
  ),
);
const script = action.runs.steps[0].run;

test('stages the API key privately and makes notarization credentials available to the build', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'orvilo-notarization-'));
  const output = path.join(dir, 'env');
  try {
    await writeFile(output, '');
    await exec('bash', ['-c', script], {
      env: {
        ...process.env,
        APPLE_API_ISSUER: 'test-issuer',
        APPLE_API_KEY_BASE64: Buffer.from('test private key').toString('base64'),
        APPLE_API_KEY_ID: 'test-id',
        GITHUB_ENV: output,
        RUNNER_TEMP: dir,
      },
    });
    const key = path.join(dir, 'orvilo-notarization.p8');
    assert.equal(await readFile(key, 'utf8'), 'test private key');
    assert.equal((await stat(key)).mode & 0o777, 0o600);
    const env = await readFile(output, 'utf8');
    assert.match(env, /APPLE_API_KEY_ID=test-id/);
    assert.match(env, /APPLE_API_ISSUER=test-issuer/);
    assert.ok(env.includes(`APPLE_API_KEY=${key}`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

for (const missing of ['APPLE_API_KEY_BASE64', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
  test(`fails incomplete credentials instead of silently skipping notarization: ${missing}`, async () => {
    await assert.rejects(
      exec('bash', ['-c', script], {
        env: {
          ...process.env,
          APPLE_API_ISSUER: 'test-issuer',
          APPLE_API_KEY_BASE64: Buffer.from('test private key').toString('base64'),
          APPLE_API_KEY_ID: 'test-id',
          [missing]: '',
        },
      }),
      new RegExp(`Missing ${missing}`),
    );
  });
}
