import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { canCleanupPreview } from './checkPreviewCleanup.mjs';
import { normalizePreviewDatabaseUrl } from './normalizePreviewDatabaseUrl.mjs';

const fixtureUrl = new URL(
  'postgresql://192.0.2.1:25432/orvilo_preview?sslmode=require&uselibpqcompat=true&application_name=preview',
);
fixtureUrl.username = 'app';
fixtureUrl.password = 'fixture-password';
test('the published app and CI URLs use the same certificate hostname as the probes', () => {
  for (const value of [fixtureUrl.toString(), fixtureUrl.toString().replace('//app:', '//ci:')]) {
    const original = new URL(value);
    const normalized = new URL(normalizePreviewDatabaseUrl(value, 'db.example.test'));
    for (const key of ['username', 'password', 'pathname', 'port']) {
      assert.equal(normalized[key], original[key]);
    }
    assert.equal(normalized.hostname, 'db.example.test');
    assert.equal(normalized.searchParams.get('application_name'), 'preview');
    assert.equal(normalized.searchParams.get('sslmode'), 'verify-full');
    assert.equal(normalized.searchParams.has('uselibpqcompat'), false);
  }
});
for (const [value, host] of [
  ['', 'db.example.test'],
  ['https://wrong.example/a', 'db.example.test'],
  [fixtureUrl.toString(), ''],
  [fixtureUrl.toString(), 'https://db.example.test'],
  [fixtureUrl.toString(), 'db.example.test:25432'],
]) {
  test(`invalid restricted database input fails closed: ${value ? host : 'missing URL'}`, () =>
    assert.throws(() => normalizePreviewDatabaseUrl(value, host)));
}
test('the setup wizard normalizes both values before every restricted-role probe and publication', () => {
  const script = readFileSync(new URL('../setup-cloud-dev.sh', import.meta.url), 'utf8');
  for (const name of ['PREVIEW_DATABASE_URL', 'PREVIEW_TEST_DATABASE_URL']) {
    const normalize = script.indexOf(`${name}=$(PREVIEW_RESTRICTED_URL=`);
    assert.ok(normalize > 0);
    assert.ok(script.indexOf(`try_pg "$${name}" "$RESTRICTED_ROLE_CHECK"`) > normalize);
    assert.ok(script.indexOf(`set_secret ${name} "$${name}"`) > normalize);
  }
});
const config = {
  apiBase: 'https://github.invalid',
  repository: 'owner/repo',
  headBranch: 'feat/shared',
  closedNumber: 18,
  token: 'fixture-token',
};
const pr = (number, branch = 'feat/shared') => ({
  number,
  state: 'open',
  head: { ref: branch, repo: { full_name: 'owner/repo' } },
});
const api = (pages) => {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => pages[Number(url.searchParams.get('page')) - 1] || [] };
    },
  };
};
test('closing one of two PRs on a branch keeps both database and environment', async () => {
  const fetcher = api([[pr(19)]]);
  assert.equal(await canCleanupPreview({ ...config, ...fetcher }), false);
});
test('closing the last PR on a branch allows its teardown', async () => {
  assert.equal(await canCleanupPreview({ ...config, ...api([[]]) }), true);
});
test('branch reuse on a later page prevents teardown', async () => {
  const fetcher = api([Array.from({ length: 100 }, (_, i) => pr(100 + i, `other-${i}`)), [pr(19)]]);
  assert.equal(await canCleanupPreview({ ...config, ...fetcher }), false);
  assert.equal(fetcher.calls.length, 2);
  assert.equal(fetcher.calls[0].searchParams.get('head'), 'owner:feat/shared');
});
test('inventory HTTP failures cannot authorize deletion', async () => {
  await assert.rejects(canCleanupPreview({ ...config, fetchImpl: async () => ({ ok: false }) }));
});
for (const rows of [{}, [null], [{ number: 19 }]]) {
  test('malformed inventory fails closed', async () => {
    await assert.rejects(
      canCleanupPreview({
        ...config,
        fetchImpl: async () => ({ ok: true, json: async () => rows }),
      }),
    );
  });
}
test('cleanup decodes literal PEM newlines before psql reads its CA', () => {
  const script = readFileSync(
    new URL('../../.github/workflows/preview-cleanup.yml', import.meta.url),
    'utf8',
  );
  const code = script.match(
    /DATABASE_SSL_CA="\$DATABASE_SSL_CA" node -e '([\s\S]*?)' > "\$pg_ca_file"/,
  )?.[1];
  assert.ok(code, 'the workflow must normalize the supported PEM representation');
  const result = spawnSync(process.execPath, ['-e', code], {
    env: { ...process.env, DATABASE_SSL_CA: 'BEGIN\\nfixture\\nEND' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'BEGIN\nfixture\nEND');
});
test('all destructive workflow steps depend on successful branch preflight', () => {
  const script = readFileSync(
    new URL('../../.github/workflows/preview-cleanup.yml', import.meta.url),
    'utf8',
  );
  const preflight = script.indexOf('id: cleanup-preflight');
  for (const name of ['Drop database and per-PR roles', 'Remove Vercel branch env DATABASE_URL']) {
    const index = script.indexOf(`- name: ${name}`);
    assert.ok(preflight >= 0 && index > preflight);
    assert.match(
      script.slice(index).split('\n').slice(0, 3).join('\n'),
      /steps\.cleanup-preflight\.outputs\.allowed == 'true'/,
    );
  }
});
test('Preview readers have only the additional metadata read permissions they need', () => {
  for (const file of ['preview-smoke.yml', 'preview-e2e.yml']) {
    const script = readFileSync(
      new URL(`../../.github/workflows/${file}`, import.meta.url),
      'utf8',
    );
    const permissions = script.match(/permissions:\n([\s\S]*?)\n\n/)[1];
    assert.match(permissions, /deployments: read/);
    assert.match(permissions, /pull-requests: read/);
    assert.doesNotMatch(permissions, /write/);
  }
});
