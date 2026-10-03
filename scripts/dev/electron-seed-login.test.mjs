import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localServerUrl, seedElectronLogin, sessionCookies } from './electron-seed-login.mjs';

test('local seed login accepts only an exact localhost HTTP server', () => {
  assert.equal(localServerUrl('http://localhost:3010').origin, 'http://localhost:3010');
  for (const value of [
    'https://localhost:3010',
    'http://127.0.0.1:3010',
    'http://localhost:3010.evil.test',
    'http://user:password@localhost:3010',
    'http://localhost:3010/path',
  ]) {
    assert.throws(() => localServerUrl(value));
  }
});

test('only Better Auth session cookies are selected for Electron', () => {
  const headers = new Headers();
  headers.append('set-cookie', 'theme=dark; Path=/');
  headers.append('set-cookie', 'better-auth.session_token=abc.def; Path=/; HttpOnly; SameSite=Lax');
  headers.append('set-cookie', 'better-auth.session_data=encoded%3D; Path=/; HttpOnly');
  assert.deepEqual(sessionCookies(headers), [
    { name: 'better-auth.session_token', value: 'abc.def', httpOnly: true, secure: false },
    { name: 'better-auth.session_data', value: 'encoded%3D', httpOnly: true, secure: false },
  ]);
  assert.throws(() => sessionCookies(new Headers()), /session token/);
});

test('seed login rejects production and nonlocal URLs before connecting', async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    await assert.rejects(seedElectronLogin(), /disabled in production/);
    process.env.NODE_ENV = 'development';
    await assert.rejects(seedElectronLogin({ serverUrl: 'https://example.com/' }), /localhost/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
