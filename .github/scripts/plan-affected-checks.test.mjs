import assert from 'node:assert/strict';
import test from 'node:test';

import { consumerScopesForApplications, planAffectedChecks } from './plan-affected-checks.mjs';

const packages = {
  byDirectory: new Map([
    ['packages/types', '@orvilo/types'],
    ['packages/utils', '@orvilo/utils'],
    ['packages/agent-signal', '@orvilo/agent-signal'],
    ['packages/agent-runtime', '@orvilo/agent-runtime'],
    ['packages/desktop-bridge', '@orvilo/desktop-bridge'],
    ['packages/device-control', '@orvilo/device-control'],
    ['packages/html-artifact', '@orvilo/html-artifact'],
    ['packages/local-file-shell', '@orvilo/local-file-shell'],
  ]),
  reverseDependencies: new Map([
    ['@orvilo/types', new Set(['@orvilo/agent-runtime'])],
    ['@orvilo/agent-runtime', new Set(['@orvilo/agent-manager-runtime'])],
  ]),
  consumerScopes: new Map([
    ['@orvilo/desktop-bridge', new Set(['desktop'])],
    ['@orvilo/html-artifact', new Set(['desktop'])],
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
  assert.equal(plan.run_typecheck, true);
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

test('propagates a package change to application consumers', () => {
  const plan = planAffectedChecks(['packages/desktop-bridge/src/index.ts'], { packages });

  assert.equal(plan.run_desktop, true);
});

test('propagates a package change through workspace dependencies to an application consumer', () => {
  const plan = planAffectedChecks(['packages/html-artifact/src/index.ts'], { packages });

  assert.equal(plan.run_desktop, true);
});

test('derives consumer scopes through transitive workspace dependencies', () => {
  const scopes = consumerScopesForApplications(
    [{ dependencies: ['@orvilo/device-control'], scope: 'desktop' }],
    new Map([
      ['@orvilo/device-control', new Set(['@orvilo/html-artifact'])],
      ['@orvilo/html-artifact', new Set()],
    ]),
  );

  assert.deepEqual(scopes.get('@orvilo/html-artifact'), new Set(['desktop']));
});

test('fails closed when a package manifest changes the dependency graph', () => {
  const plan = planAffectedChecks(['packages/agent-signal/package.json'], { packages });

  assert.equal(plan.run_typecheck, true);
  assert.equal(plan.run_desktop, true);
});

test('keeps executable documentation tooling out of the documentation exemption', () => {
  const plan = planAffectedChecks(['docs/development/audit-merge-pipeline.sh'], { packages });

  assert.equal(plan.run_typecheck, true);
});

test('runs both app and server checks for backend route shells', () => {
  const plan = planAffectedChecks(['src/app/(backend)/webapi/ping/route.test.ts'], { packages });

  assert.equal(plan.run_app, true);
  assert.equal(plan.run_server, true);
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
    assert.deepEqual(
      plan.test_packages,
      [
        '@orvilo/agent-manager-runtime',
        '@orvilo/agent-runtime',
        '@orvilo/agent-signal',
        '@orvilo/local-file-shell',
        '@orvilo/types',
      ],
      file,
    );
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
