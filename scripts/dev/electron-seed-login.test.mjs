import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localServerUrl, seedElectronLogin } from './electron-seed-login.mjs';

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

test('seed login refuses an Electron that is not using the local device gateway', async () => {
  const previous = process.env.NODE_ENV;
  try {
    delete process.env.NODE_ENV;
    await assert.rejects(
      seedElectronLogin({
        cdpPort: '1',
        serverUrl: 'http://localhost:3010/',
        verifyTarget: () => true,
      }),
      /local device gateway/,
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
