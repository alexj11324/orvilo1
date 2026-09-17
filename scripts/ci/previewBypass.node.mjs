import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { bootstrapPreviewBypass } from '../../e2e/src/support/previewBypass.ts';

const base = 'https://app-test.vercel.app/path';
const fixture = (overrides = {}) => {
  const calls = [];
  const response = {
    status: () => 302,
    headersArray: () => [
      { name: 'Set-Cookie', value: 'bypass=opaque-cookie; Secure; HttpOnly; Path=/' },
      { name: 'Location', value: 'https://third-party.example/tracker' },
    ],
    dispose: async () => { calls.push(['dispose']); },
    ...overrides,
  };
  const api = {
    get: async (...args) => { calls.push(args); return response; },
    storageState: async () => ({ cookies: [{ name: 'bypass', domain: 'app-test.vercel.app', secure: true }] }),
  };
  return { api, calls };
};
test('bypass header is limited to a single origin request without redirect forwarding', async () => {
  const { api, calls } = fixture();
  await bootstrapPreviewBypass(api, base, 'fixture-secret');
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'https://app-test.vercel.app/');
  assert.equal(calls[0][1].maxRedirects, 0);
  assert.deepEqual(calls[0][1].headers, {
    'x-vercel-protection-bypass': 'fixture-secret',
    'x-vercel-set-bypass-cookie': 'true',
  });
  assert.equal(calls[0][0].includes('fixture-secret'), false);
  assert.equal(calls.some((call) => String(call[0]).includes('third-party.example')), false);
});
test('local CI without a bypass secret performs no bootstrap request', async () => {
  const { api, calls } = fixture();
  await bootstrapPreviewBypass(api, 'http://localhost:3006', undefined);
  assert.equal(calls.length, 0);
});
for (const status of [401, 403, 500]) {
  test(`a rejected bootstrap (${status}) cannot proceed`, async () => {
    const { api } = fixture({ status: () => status });
    await assert.rejects(bootstrapPreviewBypass(api, base, 'fixture-secret'), /bootstrap failed/);
  });
}
for (const domain of ['third-party.example', '.vercel.app']) {
  test(`a cookie for ${domain} cannot establish this origin`, async () => {
    const { api } = fixture();
    api.storageState = async () => ({ cookies: [{ name: 'bypass', domain, secure: true }] });
    await assert.rejects(bootstrapPreviewBypass(api, base, 'fixture-secret'), /bootstrap failed/);
  });
}
test('missing and insecure cookies fail closed', async () => {
  for (const cookies of [[], [{ name: 'bypass', domain: 'app-test.vercel.app', secure: false }]]) {
    const { api } = fixture();
    api.storageState = async () => ({ cookies });
    await assert.rejects(bootstrapPreviewBypass(api, base, 'fixture-secret'), /bootstrap failed/);
  }
});
test('transport errors do not reveal the header secret', async () => {
  const { api } = fixture();
  api.get = async () => { throw new Error('request headers contained fixture-secret'); };
  await assert.rejects(bootstrapPreviewBypass(api, base, 'fixture-secret'), (error) => {
    assert.equal(String(error).includes('fixture-secret'), false);
    assert.equal(error.cause, undefined);
    return true;
  });
});
test('browser and auth contexts never configure global bypass headers', () => {
  for (const relative of ['../../e2e/src/support/world.ts', '../../e2e/src/steps/hooks.ts']) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    assert.equal(source.includes('extraHTTPHeaders'), false);
    assert.equal(source.includes('bootstrapPreviewBypass('), true);
  }
});
