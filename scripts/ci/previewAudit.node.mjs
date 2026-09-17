import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertExecutedJobs } from './checkGitHubWorkflowGate.mjs';
import { resolvePreviewMigration } from './resolvePreviewMigration.mjs';

const config = {
  adminUrl: 'postgresql://admin:admin-pass@db.example:25432/postgres?sslmode=require&uselibpqcompat=true',
  appUrl: 'postgresql://app:app-pass@db.example:25432/orvilo_preview?sslmode=require',
  ca: 'pinned-test-CA',
};
test('migration retains admin authentication but targets the application database', () => {
  const url = new URL(resolvePreviewMigration(config));
  assert.equal(url.pathname, '/orvilo_preview');
  assert.equal(url.username, 'admin');
  assert.equal(url.password, 'admin-pass');
  assert.equal(url.searchParams.get('sslmode'), 'verify-full');
  assert.equal(url.searchParams.has('uselibpqcompat'), false);
});
for (const [name, patch] of Object.entries({
  'missing admin': { adminUrl: '' },
  'missing application': { appUrl: '' },
  'missing CA': { ca: '' },
  'maintenance database': { appUrl: config.appUrl.replace('orvilo_preview', 'postgres') },
  'wrong cluster': { appUrl: config.appUrl.replace('db.example', 'other.example') },
  'non-postgres URL': { appUrl: 'https://db.example/orvilo_preview' },
})) {
  test(`migration fails closed for ${name}`, () =>
    assert.throws(() => resolvePreviewMigration({ ...config, ...patch })));
}
test('a duplicate-skipped E2E workflow cannot satisfy the deployment gate', () => {
  assert.throws(() => assertExecutedJobs([
    { name: 'Check Duplicate Run', status: 'completed', conclusion: 'success', steps: [{}] },
    { name: 'Test Web App', status: 'completed', conclusion: 'skipped', steps: [] },
  ], 'E2E CI'), /no executed/);
});
test('an actually executed successful E2E job satisfies the gate', () => {
  assert.doesNotThrow(() => assertExecutedJobs([
    { name: 'Test Web App', status: 'completed', conclusion: 'success', steps: [{}] },
  ], 'E2E CI'));
});
test('missing and failed verification jobs fail closed', () => {
  assert.throws(() => assertExecutedJobs([], 'E2E CI'));
  assert.throws(() => assertExecutedJobs([
    { name: 'Test Web App', status: 'completed', conclusion: 'failure', steps: [{}] },
  ], 'E2E CI'));
});

test('the real CI gate main rejects a successful run whose tests were skipped', async () => {
  const { spawnSync } = await import('node:child_process');
  const moduleUrl = new URL('./checkGitHubWorkflowGate.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    globalThis.fetch = async url => ({ ok: true, json: async () => String(url).includes('/jobs?')
      ? { jobs: [{ name: 'Test Web App', status: 'completed', conclusion: 'skipped', steps: [] }] }
      : { workflow_runs: [{ id: 1, name: 'E2E CI', head_sha: 'fixture', event: 'push', status: 'completed', conclusion: 'success' }] }
    });
    const { main } = await import(${JSON.stringify(moduleUrl)});
    try { await main(); process.exitCode = 3; } catch (error) {
      if (!error.message.includes('no executed verification job')) throw error;
    }
  `], {
    env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fixture',
      REQUIRED_SHA: 'fixture', REQUIRED_WORKFLOWS: 'E2E CI' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

for (const mode of ['duplicate', 'failed-newer', 'running-newer']) {
  test(`CI evidence handles ${mode} without hiding a newer result`, async () => {
    const { spawnSync } = await import('node:child_process');
    const moduleUrl = new URL('./checkGitHubWorkflowGate.mjs', import.meta.url).href;
    const status = mode === 'running-newer' ? 'in_progress' : 'completed';
    const conclusion = mode === 'failed-newer' ? 'failure' : mode === 'running-newer' ? null : 'success';
    const runs = [
      { id: 1, name: 'E2E CI', head_sha: 'fixture', event: 'push', status: 'completed', conclusion: 'success', created_at: '2026-09-17T00:00:00Z' },
      { id: 2, name: 'E2E CI', head_sha: 'fixture', event: 'push', status, conclusion, created_at: '2026-09-17T00:01:00Z' },
    ];
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      globalThis.fetch = async url => ({ ok: true, json: async () => String(url).includes('/jobs?')
        ? { jobs: [{ name: 'Test Web App', status: 'completed', conclusion: String(url).includes('/2/') ? 'skipped' : 'success', steps: [{}] }] }
        : { workflow_runs: ${JSON.stringify(runs)} }
      });
      const { main } = await import(${JSON.stringify(moduleUrl)});
      ${mode === 'duplicate' ? 'await main();' : "try { await main(); process.exitCode = 3; } catch (error) { if (!error.message.includes('GitHub CI gate E2E CI is')) throw error; }"}
    `], {
      env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fixture',
        REQUIRED_SHA: 'fixture', REQUIRED_WORKFLOWS: 'E2E CI', REQUIRED_EVENT: 'push' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}
