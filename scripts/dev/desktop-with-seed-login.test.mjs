import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import * as localDeviceGateway from './local-device-gateway.mjs';

for (const source of ['absent', 'shell', 'dotenv', 'cached', 'generator-failure']) {
  test(`seed launcher supplies local auth credentials (${source})`, async (t) => {
    const cwd = process.cwd();
    const env = { ...process.env };
    const exitCode = process.exitCode;
    const dir = await mkdtemp(path.join(tmpdir(), 'orvilo-seed-env-test-'));
    const launches = [];
    const children = [];
    let generations = 0;
    const jwks = '{"keys":[{"kty":"RSA","d":"private-fixture"}]}';
    const jwksFile = '.records/env/agent-testing-jwks.json';
    const tokenFile = path.join(dir, 'device-gateway.token');
    try {
      process.chdir(dir);
      delete process.env.CLERK_SECRET_KEY;
      delete process.env.NODE_ENV;
      delete process.env.JWKS_KEY;
      Object.assign(process.env, {
        CLERK_STUB_PORT: '3411',
        ORVILO_DESKTOP_CDP_PORT: '9263',
        SERVER_URL: 'http://localhost:3010/',
      });
      if (source === 'shell') {
        process.env.CLERK_SECRET_KEY = 'shell-fixture-secret';
        process.env.JWKS_KEY = jwks;
      }
      if (source === 'dotenv')
        await writeFile('.env', `CLERK_SECRET_KEY=dotenv-fixture-secret\nJWKS_KEY=${jwks}\n`);
      if (source === 'cached') {
        await mkdir(path.dirname(jwksFile), { recursive: true, mode: 0o700 });
        await writeFile(jwksFile, jwks, { mode: 0o600 });
      }
      await writeFile(tokenFile, 'fixture-service-token');
      t.mock.module('node:child_process', {
        namedExports: {
          execFile: (command, args, options, callback) => {
            generations++;
            assert.equal(command, process.execPath);
            assert.deepEqual(args, ['scripts/generate-oidc-jwk.mjs']);
            if (source === 'generator-failure')
              callback(new Error(`generator stderr: ${jwks}`), '', jwks);
            else callback(null, `${jwks}\n`, jwks);
          },
          execFileSync: (command, args) => {
            if (command === 'bash' && args?.includes('env')) {
              return [
                'export DEVICE_GATEWAY_URL=http://localhost:8787',
                `export DEVICE_GATEWAY_SERVICE_TOKEN="$(cat '${tokenFile}')"`,
                '# Start Electron with DEVICE_GATEWAY_URL=http://localhost:8787 as well.',
                '',
              ].join('\n');
            }
            throw new Error('No real subprocesses');
          },
          spawn: (command, args, options) => {
            launches.push({ args, env: options.env });
            const child = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            children.push(child);
            if (args.includes('dev:desktop'))
              queueMicrotask(() => {
                child.emit('exit', 1);
                for (const entry of children) entry.emit('close');
              });
            return child;
          },
        },
      });
      t.mock.module('./local-device-gateway.mjs', {
        namedExports: {
          ...localDeviceGateway,
          waitForLocalPort: async () => {},
        },
      });
      t.mock.module('node:net', {
        defaultExport: {
          createConnection: () => {
            const socket = new EventEmitter();
            socket.destroy = () => {};
            socket.setTimeout = () => {};
            queueMicrotask(() => socket.emit('error'));
            return socket;
          },
        },
      });
      t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('No real network');
      });
      if (source === 'generator-failure') {
        await assert.rejects(import(`./desktop-with-seed-login.mjs?source=${source}`), {
          message: 'Local signing key generation failed',
        });
        assert.equal(launches.length, 0);
        await assert.rejects(access(jwksFile));
        return;
      }
      await import(`./desktop-with-seed-login.mjs?source=${source}`);
      const gateway = launches.find(
        ({ args }) =>
          args.some((arg) => String(arg).endsWith('local-device-gateway-setup.sh')) &&
          args.includes('start'),
      );
      assert.ok(gateway, 'skip-login starts the local device gateway before Next and Electron');
      assert.equal(gateway.env.GATEWAY_PORT, '8787');
      assert.equal(gateway.env.JWKS_KEY, jwks);
      const server = launches.find(({ args }) => args.includes('dev:next'));
      assert.equal(server.env.CLERK_API_URL, 'http://127.0.0.1:3411');
      assert.ok(
        server.env.CLERK_SECRET_KEY,
        'Clerk rejects seed sessions before consulting the stub without a key',
      );
      if (source === 'shell' || source === 'dotenv')
        assert.equal(server.env.CLERK_SECRET_KEY, `${source}-fixture-secret`);
      assert.equal(server.env.DEVICE_GATEWAY_URL, 'http://localhost:8787');
      assert.equal(server.env.DEVICE_GATEWAY_SERVICE_TOKEN, 'fixture-service-token');
      const desktop = launches.find(({ args }) => args.includes('dev:desktop'));
      assert.equal(desktop.env.DEVICE_GATEWAY_URL, 'http://localhost:8787');
      assert.ok(launches.every(({ env: childEnv }) => childEnv.JWKS_KEY === jwks));
      assert.equal(generations, source === 'absent' ? 1 : 0);
      if (source === 'absent' || source === 'cached') {
        assert.equal(await readFile(jwksFile, 'utf8'), jwks);
        assert.equal((await stat(jwksFile)).mode & 0o777, 0o600);
        assert.equal((await stat(path.dirname(jwksFile))).mode & 0o777, 0o700);
      } else await assert.rejects(access(jwksFile));
    } finally {
      t.mock.restoreAll();
      process.chdir(cwd);
      for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
      Object.assign(process.env, env);
      process.exitCode = exitCode;
      await rm(dir, { recursive: true, force: true });
    }
  });
}
