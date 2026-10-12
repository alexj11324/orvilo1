import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

for (const source of ['absent', 'shell', 'dotenv']) {
  test(`seed launcher supplies the Clerk stub credential (${source})`, async (t) => {
    const cwd = process.cwd();
    const env = { ...process.env };
    const exitCode = process.exitCode;
    const dir = await mkdtemp(path.join(tmpdir(), 'orvilo-seed-env-test-'));
    const launches = [];
    const children = [];
    try {
      process.chdir(dir);
      delete process.env.CLERK_SECRET_KEY;
      delete process.env.NODE_ENV;
      Object.assign(process.env, {
        CLERK_STUB_PORT: '3411',
        ORVILO_DESKTOP_CDP_PORT: '9263',
        SERVER_URL: 'http://localhost:3010/',
      });
      if (source === 'shell') process.env.CLERK_SECRET_KEY = 'shell-fixture-secret';
      if (source === 'dotenv') await writeFile('.env', 'CLERK_SECRET_KEY=dotenv-fixture-secret\n');
      t.mock.module('node:child_process', {
        namedExports: {
          execFileSync: () => {
            throw new Error('No real subprocesses');
          },
          spawn: (command, args, options) => {
            launches.push({ args, env: options.env });
            const child = new EventEmitter();
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
      await import(`./desktop-with-seed-login.mjs?source=${source}`);
      const server = launches.find(({ args }) => args.includes('dev:next'));
      assert.equal(server.env.CLERK_API_URL, 'http://127.0.0.1:3411');
      assert.ok(
        server.env.CLERK_SECRET_KEY,
        'Clerk rejects seed sessions before consulting the stub without a key',
      );
      if (source !== 'absent')
        assert.equal(server.env.CLERK_SECRET_KEY, `${source}-fixture-secret`);
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
