import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';

import { startClerkStub } from './clerk-stub.mjs';

test('seed sessions stay local and non-seed calls preserve the upstream response', async (t) => {
  const payload = gzipSync('upstream body');
  const seen = [];
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ body: Buffer.concat(chunks).toString(), method: req.method, url: req.url });
    res.writeHead(302, {
      'content-encoding': 'gzip',
      'content-type': 'text/plain',
      'location': '/redirected',
      'set-cookie': ['first=1', 'second=2'],
      'x-clerk-request-id': 'local-probe',
    });
    res.end(payload);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const stub = await startClerkStub({
    port: 0,
    upstream: `http://127.0.0.1:${upstream.address().port}`,
  });
  t.after(() => stub.close());
  assert.equal(stub.address().address, '127.0.0.1');
  const origin = `http://127.0.0.1:${stub.address().port}`;
  const seed = await fetch(`${origin}/v1/sessions/sess_local_seed_test-user`);
  assert.equal(seed.status, 200);
  assert.equal((await seed.json()).user_id, 'clerk_local_seed_test-user');
  assert.equal(seen.length, 0);
  const forwarded = await new Promise((resolve, reject) => {
    const req = request(`${origin}/v1/users?limit=2`, { method: 'POST' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ body: Buffer.concat(chunks), headers: res.headers, status: res.statusCode }),
      );
    });
    req.on('error', reject);
    req.end('request body');
  });
  assert.equal(forwarded.status, 302);
  assert.equal(forwarded.headers.location, '/redirected');
  assert.equal(forwarded.headers['x-clerk-request-id'], 'local-probe');
  assert.equal(forwarded.headers['content-encoding'], 'gzip');
  assert.deepEqual(forwarded.headers['set-cookie'], ['first=1', 'second=2']);
  assert.deepEqual(forwarded.body, payload);
  assert.deepEqual(seen, [{ body: 'request body', method: 'POST', url: '/v1/users?limit=2' }]);
});

test('the production command refuses to start', () => {
  const result = spawnSync(
    process.execPath,
    [new URL('./clerk-stub.mjs', import.meta.url).pathname],
    {
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /refuses to run in production/);
});

test('an interrupted upstream response closes the downstream connection', async (t) => {
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { 'content-length': '100' });
    res.write('partial');
    setTimeout(() => res.destroy(), 20);
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const stub = await startClerkStub({
    port: 0,
    upstream: `http://127.0.0.1:${upstream.address().port}`,
  });
  t.after(() => stub.close());
  await assert.rejects(async () => {
    const response = await fetch(`http://127.0.0.1:${stub.address().port}/v1/users`, {
      signal: AbortSignal.timeout(2000),
    });
    await response.text();
  }, /terminated/);
});
