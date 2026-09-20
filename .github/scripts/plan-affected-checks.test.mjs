import assert from 'node:assert/strict';
import test from 'node:test';

import { planAffectedChecks } from './plan-affected-checks.mjs';

const packages = {
  byDirectory: new Map([
    ['packages/types', '@orvilo/types'],
    ['packages/utils', '@orvilo/utils'],
    ['packages/agent-signal', '@orvilo/agent-signal'],
    ['packages/agent-runtime', '@orvilo/agent-runtime'],
    ['packages/local-file-shell', '@orvilo/local-file-shell'],
  ]),
  reverseDependencies: new Map([
    ['@orvilo/types', new Set(['@orvilo/agent-runtime'])],
    ['@orvilo/agent-runtime', new Set(['@orvilo/agent-manager-runtime'])],
  ]),
  testPackageNames: new Set([
    '@orvilo/agent-runtime',
    '@orvilo/agent-manager-runtime',
    '@orvilo/agent-signal',
    '@orvilo/local-file-shell',
    '@orvilo/types',
  ]),
};

test('keeps a small web change on the web path', () => {
  const plan = planAffectedChecks(['src/features/chat/Composer/index.tsx'], { packages });

  assert.equal(plan.run_static, true);
  assert.equal(plan.run_app, true);
  assert.equal(plan.run_server, false);
  assert.equal(plan.run_database, false);
  assert.equal(plan.run_desktop, false);
  assert.equal(plan.run_typecheck, false);
  assert.equal(plan.run_e2e, false);
});

test('routes a server change only to the server suite', () => {
  const plan = planAffectedChecks(['apps/server/src/services/task.ts'], { packages });

  assert.equal(plan.run_server, true);
  assert.equal(plan.run_app, false);
  assert.equal(plan.run_database, false);
  assert.equal(plan.run_desktop, false);
});

test('treats a database boundary as integration-risky', () => {
  const plan = planAffectedChecks(['packages/database/src/models/task.ts'], { packages });

  assert.equal(plan.run_app, true);
  assert.equal(plan.run_server, true);
  assert.equal(plan.run_database, true);
  assert.equal(plan.run_typecheck, true);
  assert.equal(plan.run_e2e, true);
});

test('includes changed and reverse-dependent package suites', () => {
  const plan = planAffectedChecks(['packages/types/src/task.ts'], { packages });

  assert.equal(plan.run_packages, true);
  assert.deepEqual(plan.test_packages, [
    '@orvilo/agent-manager-runtime',
    '@orvilo/agent-runtime',
    '@orvilo/types',
  ]);
  assert.equal(plan.run_desktop, true);
  assert.equal(plan.run_typecheck, true);
});

test('routes the Windows shell to its platform check', () => {
  const plan = planAffectedChecks(['packages/local-file-shell/src/quote.ts'], { packages });

  assert.equal(plan.run_windows_shell, true);
  assert.equal(plan.run_app, false);
  assert.equal(plan.run_server, false);
});

test('keeps test-bearing packages outside the former fixed list in the plan', () => {
  const plan = planAffectedChecks(['packages/agent-signal/src/index.ts'], { packages });

  assert.equal(plan.run_packages, true);
  assert.deepEqual(plan.test_packages, ['@orvilo/agent-signal']);
});

test('fails closed for CI configuration and unknown paths', () => {
  for (const file of ['.github/workflows/test.yml', 'infra/new-check.yaml']) {
    const plan = planAffectedChecks([file], { packages });
    assert.equal(plan.run_typecheck, true, file);
    assert.equal(plan.run_e2e, true, file);
    assert.deepEqual(plan.test_packages, [
      '@orvilo/agent-manager-runtime',
      '@orvilo/agent-runtime',
      '@orvilo/agent-signal',
      '@orvilo/local-file-shell',
      '@orvilo/types',
    ], file);
  }
});

test('leaves documentation-only changes to the documentation gate', () => {
  const plan = planAffectedChecks(['docs/development/ci.md', 'README.md'], { packages });

  assert.equal(plan.run_static, false);
  assert.equal(plan.run_app, false);
  assert.equal(plan.run_e2e, false);
});

test('allows a reviewer label to request browser regression coverage', () => {
  const plan = planAffectedChecks(['src/features/chat/Composer/index.tsx'], {
    forceE2E: true,
    packages,
  });

  assert.equal(plan.run_app, true);
  assert.equal(plan.run_e2e, true);
});
