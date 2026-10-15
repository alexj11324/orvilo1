import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findReusableDeployment } from './findVercelDeployment.mjs';
import { eventHeadSha, previewTargets, resolveTargets } from './vercelGateTargets.mjs';
import { evaluateGateSnapshot, main } from './vercelPreviewGate.mjs';

const sha = 'a'.repeat(40);
const repository = 'owner/repo';
const pull = {
  number: 1,
  state: 'open',
  head: { sha, ref: 'feature', repo: { full_name: repository } },
};

test('completion events resolve their source SHA, never the default checkout SHA', () => {
  assert.equal(eventHeadSha({ workflow_run: { head_sha: sha }, sha: 'b'.repeat(40) }), sha);
  assert.equal(eventHeadSha({ check_run: { head_sha: sha } }), sha);
  assert.equal(eventHeadSha({ check_suite: { head_sha: sha } }), sha);
  assert.equal(eventHeadSha({ pull_request: pull }), sha);
  assert.equal(eventHeadSha({ sha }), sha);
});

test('preview targets reject closed, stale and fork PRs but support multiple current PRs', () => {
  const candidates = [
    pull,
    { ...pull, number: 2 },
    { ...pull, state: 'closed' },
    { ...pull, head: { ...pull.head, sha: 'b'.repeat(40) } },
    { ...pull, head: { ...pull.head, repo: { full_name: 'fork/repo' } } },
  ];
  assert.deepEqual(previewTargets(candidates, { sha, repository }), [
    { sha, branch: 'feature', pr: 1 },
    { sha, branch: 'feature', pr: 2 },
  ]);
});

test('external completion actor cannot expand owner-only preview authorization', async () => {
  const options = {
    event: { check_run: { head_sha: sha } },
    repository,
    owner: 'owner',
    mode: 'preview',
  };
  const run = {
    name: 'Test CI',
    head_sha: sha,
    event: 'push',
    actor: { login: 'owner' },
    triggering_actor: { login: 'owner' },
  };
  const get = async (path) => (path.startsWith('/actions/') ? { workflow_runs: [run] } : [pull]);
  assert.equal((await resolveTargets({ ...options, get })).length, 1);
  run.triggering_actor.login = 'someone-else';
  assert.deepEqual(await resolveTargets({ ...options, get }), []);
  assert.deepEqual(
    await resolveTargets({
      ...options,
      event: { workflow_run: { head_sha: sha, head_repository: { full_name: 'fork/repo' } } },
      get,
    }),
    [],
  );
});

test('branch deployment only targets the current protected ref', async () => {
  const targets = await resolveTargets({
    event: { sha },
    mode: 'branch',
    repository,
    get: async (path) => ({ object: { sha: path.endsWith('/canary') ? sha : 'b'.repeat(40) } }),
  });
  assert.deepEqual(targets, [{ sha, branch: 'canary' }]);
});

test('deduplication includes SHA, branch, PR, target and usable state', () => {
  const deployment = {
    meta: { githubCommitSha: sha, githubCommitRef: 'feature', githubPrId: '1' },
    target: null,
    readyState: 'READY',
  };
  const target = { sha, branch: 'feature', target: '', pr: 1 };
  assert.equal(findReusableDeployment([deployment], target), deployment);
  for (const change of [
    { sha: 'b'.repeat(40) },
    { branch: 'another' },
    { pr: 2 },
    { target: 'production' },
  ]) {
    assert.equal(findReusableDeployment([deployment], { ...target, ...change }), undefined);
  }
  assert.equal(findReusableDeployment([{ ...deployment, readyState: 'ERROR' }], target), undefined);
});

test('a cancelled owning workflow cannot pass via successful partial jobs', () => {
  const result = evaluateGateSnapshot({
    headSha: sha,
    requiredWorkflows: ['Test CI'],
    requiredCheckRuns: [],
    runs: [
      {
        id: 1,
        name: 'Test CI',
        event: 'push',
        head_sha: sha,
        status: 'completed',
        conclusion: 'cancelled',
      },
    ],
    jobsByRun: new Map([
      [1, [{ name: 'Typecheck', status: 'completed', conclusion: 'success', steps: [{}] }]],
    ]),
    checkRuns: [],
    statuses: [],
  });
  assert.equal(result.state, 'failed');
});

test('single-pass pending gate releases the runner and never emits deploy permission', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ci-gate-'));
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    Object.assign(process.env, {
      GITHUB_REPOSITORY: repository,
      GITHUB_TOKEN: 'test',
      HEAD_SHA: sha,
      GATE_SINGLE_PASS: 'true',
      GITHUB_OUTPUT: path.join(directory, 'output'),
    });
    globalThis.fetch = async () => {
      calls++;
      return { ok: true, json: async () => ({ workflow_runs: [], check_runs: [], statuses: [] }) };
    };
    assert.equal((await main()).state, 'pending');
    assert.equal(calls, 3);
    assert.equal(readFileSync(process.env.GITHUB_OUTPUT, 'utf8'), 'ready=false\n');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(directory, { recursive: true, force: true });
  }
});
