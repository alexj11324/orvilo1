from pathlib import Path
r=Path.cwd()
p=r/'scripts/ci/checkGitHubWorkflowGate.mjs';s=p.read_text();pos=s.index('const fetchJson = ')
s=s[:pos]+'''export const assertExecutedJobs = (jobs, workflowName) => {
  const required = workflowName === 'E2E CI'
    ? jobs.filter(job => job.name === 'Test Web App')
    : jobs.filter(job => job.name !== 'Check Duplicate Run');
  if (required.length === 0 || !required.some(job =>
    job.status === 'completed' && job.conclusion === 'success' && job.steps?.length > 0)) {
    throw new Error(`GitHub CI gate ${workflowName} has no executed verification job`);
  }
  if (required.some(job => job.status !== 'completed' || !['success', 'skipped'].includes(job.conclusion))) {
    throw new Error(`GitHub CI gate ${workflowName} has unfinished or failed verification jobs`);
  }
};

''' + s[pos:]
s=s.replace('    assertSuccessfulRun(run, workflowName);','''    assertSuccessfulRun(run, workflowName);
    const jobs = [];
    for (let page = 1; ; page++) {
      const response = await fetchJson(`${apiBase}/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100&page=${page}`);
      if (!Array.isArray(response.jobs)) throw new Error('GitHub job inventory is missing');
      jobs.push(...response.jobs);
      if (response.jobs.length < 100) break;
    }
    assertExecutedJobs(jobs, workflowName);''')
p.write_text(s)
(r/'scripts/ci/previewAudit.test.mjs').write_text('''import assert from 'node:assert/strict';
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
  test(`migration fails closed for ${name}`, () => assert.throws(() => resolvePreviewMigration({ ...config, ...patch })));
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
  `], { env: { ...process.env, GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'fixture', REQUIRED_SHA: 'fixture', REQUIRED_WORKFLOWS: 'E2E CI' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
''')
(r/'scripts/ci/previewIdentitySecrets.test.sh').write_text('''#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/previewIdentitySecrets.sh"
warn() { printf '%s\\n' "$*" >&2; }
note() { :; }
_existing() { [[ -n "${LOCAL_VALUE:-}" ]] && printf '%s' "$LOCAL_VALUE"; }
ask_secret() { printf -v "$1" '%s' "${PASTED_VALUE:-}"; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gen_secret() { echo generated >> "$tmp/generations"; echo new-fixture-secret; }
curl() {
  printf '%s\\n' "$*" >> "$tmp/requests"
  if [[ "${FAIL_INVENTORY:-0}" == 1 ]]; then return 22; fi
  echo '{"envs":[{"key":"KEY_VAULTS_SECRET","target":["preview"]}]}'
}
gh() { echo PREVIEW_KEY_VAULTS_SECRET; }
VERCEL_TOKEN=fixture; VERCEL_PROJECT_ID=fixture; VERCEL_ORG_ID=fixture
load_preview_identity_inventory
if resolve_preview_identity_secret KEY_VAULTS_SECRET resolved 2>/dev/null; then exit 1; fi
[[ ! -e "$tmp/generations" ]]
PASTED_VALUE=original-fixture
resolve_preview_identity_secret KEY_VAULTS_SECRET resolved
[[ "$resolved" == original-fixture ]]
publish_preview_identity_secret KEY_VAULTS_SECRET "$resolved"
! grep -q POST "$tmp/requests"
REMOTE_PREVIEW_IDENTITY_KEYS=''; PASTED_VALUE=''
if resolve_preview_identity_secret KEY_VAULTS_SECRET resolved 2>/dev/null; then exit 1; fi
[[ ! -e "$tmp/generations" ]]
REMOTE_GITHUB_IDENTITY_KEYS=''
resolve_preview_identity_secret AUTH_SECRET resolved
[[ "$resolved" == new-fixture-secret ]]
publish_preview_identity_secret AUTH_SECRET "$resolved"
grep -q 'upsert=false' "$tmp/requests"
! grep -q 'upsert=true' "$tmp/requests"
FAIL_INVENTORY=1
if load_preview_identity_inventory; then exit 1; fi
echo 'Preview identity secret preservation regressions passed'
''')
p=r/'scripts/previewValidationWorkflow.test.ts';s=p.read_text()
s=s.replace("import { readFileSync } from 'node:fs';", "import { spawnSync } from 'node:child_process';\nimport { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';\nimport { tmpdir } from 'node:os';")
pos=s.index("  it('loads current validation helpers")
s=s[:pos]+'''  it('resolves the deployment branch rather than the workflow dispatch branch', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'preview-ref-test-'));
    const url = 'https://orvilo1-abcdef-alexs-projects-078b8b0b.vercel.app';
    const sha = 'a'.repeat(40);
    try {
      const curl = path.join(directory, 'curl');
      writeFileSync(curl, `#!/usr/bin/env bash
case "$*" in
  *statuses*) echo '${JSON.stringify([{ created_at: '2026-09-17', state: 'success', environment: 'Preview', creator: { login: 'vercel[bot]' }, environment_url: url, target_url: url }])}' ;;
  *) echo '${JSON.stringify({ sha, ref: 'feat/deployment-branch', environment: 'Preview', creator: { login: 'vercel[bot]' } })}' ;;
esac
`);
      chmodSync(curl, 0o755);
      const output = path.join(directory, 'output');
      const result = spawnSync('bash', ['-c', steps.find(step => step.id === 'validate-manual-preview')!.run!], {
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, BASE_URL: url,
          EXPECTED_DEPLOYMENT_ID: '123', EXPECTED_SHA: sha, GITHUB_TOKEN: 'fixture',
          GITHUB_API_URL: 'https://github.invalid', GITHUB_REPOSITORY: 'owner/repo',
          GITHUB_REF_NAME: 'main', GITHUB_OUTPUT: output, GITHUB_ENV: path.join(directory, 'env') },
      });
      expect(result.stderr.toString()).toBe('');
      expect(result.status).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe('deployment-ref=feat/deployment-branch\\n');
    } finally { rmSync(directory, { force: true, recursive: true }); }
  });

''' +s[pos:]
p.write_text(s)
