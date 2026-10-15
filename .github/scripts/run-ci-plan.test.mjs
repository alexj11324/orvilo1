import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCiPlan } from './run-ci-plan.mjs';

const graph = {
  byDirectory: new Map([['packages/utils', '@orvilo/utils']]),
  reverseDependencies: new Map([['@orvilo/utils', new Set(['@orvilo/prompts'])]]),
  consumerScopes: new Map(),
  testPackageNames: new Set(['@orvilo/utils', '@orvilo/prompts']),
};
const plan = (files, overrides = {}) =>
  buildCiPlan({
    event: { repository: { default_branch: 'canary' } },
    eventName: 'push',
    ref: 'refs/heads/feature',
    graph,
    git: (args) => (args[0] === 'merge-base' ? 'base-sha' : files.join('\n')),
    ...overrides,
  });

test('executes only web suites for a web change, without coverage', () => {
  const result = plan(['src/features/chat/View.tsx']);
  assert.equal(result.app, true);
  assert.equal(result.typecheck, true);
  assert.equal(result.server, false);
  assert.equal(result.packages, false);
  assert.equal(result.coverage, false);
  assert.equal(result.ui, true);
});

test('UI selection uses the cumulative diff even after a documentation-only push', () => {
  assert.equal(plan(['src/features/chat/View.tsx', 'docs/followup.md']).ui, true);
  assert.equal(plan(['docs/followup.md']).ui, false);
  assert.equal(plan(['src/services/client.ts']).ui, false);
  assert.equal(plan(['pnpm-lock.yaml']).ui, true);
  assert.equal(plan([], { ref: 'refs/heads/canary' }).ui, true);
});

test('selects reverse dependent packages and keeps CLI isolated', () => {
  assert.equal(
    plan(['packages/utils/src/index.ts']).test_packages,
    '@orvilo/prompts @orvilo/utils',
  );
  const cli = plan(['apps/cli/src/index.ts']);
  assert.equal(cli.cli, true);
  assert.equal(cli.packages, true);
  assert.equal(cli.test_packages, '');
});

test('protected branches always collect full coverage and full tests', () => {
  for (const branch of ['main', 'canary']) {
    const result = plan(['docs/a.md'], { ref: `refs/heads/${branch}` });
    assert.equal(result.coverage, true);
    assert.equal(result.database, true);
    assert.equal(result.server, true);
    assert.equal(result.test_packages, '@orvilo/prompts @orvilo/utils');
  }
});

test('missing and empty base diffs fail closed into full verification', () => {
  for (const result of [
    plan([]),
    plan([], {
      git: () => {
        throw new Error('missing base');
      },
    }),
  ]) {
    assert.equal(result.app, true);
    assert.equal(result.database, true);
    assert.equal(result.windows_shell, true);
  }
});

test('compares cumulative changes to the fork PR base, not the previous push', () => {
  const calls = [];
  const result = plan([], {
    eventName: 'pull_request',
    event: { pull_request: { base: { sha: 'fork-base' } } },
    git: (args) => {
      calls.push(args);
      return args[0] === 'merge-base' ? 'common-base' : 'docs/a.md';
    },
  });
  assert.deepEqual(calls, [
    ['merge-base', 'fork-base', 'HEAD'],
    ['diff', '--name-only', '--no-renames', 'common-base', 'HEAD'],
  ]);
  assert.equal(result.app, false);
  assert.equal(result.coverage, false);
});

test('unknown changes and ci full run all suites without enabling PR coverage', () => {
  for (const result of [
    plan(['unknown/new.config']),
    plan(['docs/a.md'], {
      event: { head_commit: { message: 'fix [ci full]' } },
    }),
  ]) {
    assert.equal(result.database, true);
    assert.equal(result.desktop, true);
    assert.equal(result.coverage, false);
  }
});
