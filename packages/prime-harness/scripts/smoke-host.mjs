#!/usr/bin/env node
/**
 * Smoke driver: emulate the host side of the harness wire against a spawned
 * dist/runner.mjs. init → session.prompt; when the runner reverse-requests
 * `broker.infer`, ack it and stream canned `broker.event` notifications.
 *
 *   node scripts/smoke-host.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ARTIFACT = path.resolve(HERE, '../dist/runner.mjs');

const child = spawn(process.execPath, [ARTIFACT], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = readline.createInterface({ input: child.stdout });
const pending = new Map();
let nextId = 1;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);
const request = (method, params) => {
  const id = nextId++;
  const d = deferred();
  pending.set(id, d);
  send({ id, jsonrpc: '2.0', method, params });
  return d.promise;
};

let sessionId;
rl.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method !== undefined && msg.id !== undefined) {
    // Runner-initiated reverse request.
    if (msg.method === 'broker.infer') {
      const { requestId } = msg.params.request;
      console.log('← broker.infer', JSON.stringify(msg.params.request));
      send({ id: msg.id, jsonrpc: '2.0', result: { requestId, accepted: true } });
      const events = [
        { requestId, event: { type: 'text', text: 'Hello ' } },
        { requestId, event: { type: 'text', text: 'from broker.' } },
        { requestId, event: { type: 'usage', inputTokens: 10, outputTokens: 4 } },
        { requestId, event: { type: 'end' } },
      ];
      for (const ev of events)
        send({ jsonrpc: '2.0', method: 'broker.event', params: { sessionId, ...ev } });
      return;
    }
    if (msg.method === 'broker.cancel') {
      send({ id: msg.id, jsonrpc: '2.0', result: { ok: true } });
      return;
    }
    send({ id: msg.id, jsonrpc: '2.0', error: { code: -32601, message: 'unsupported' } });
    return;
  }
  if (msg.method === 'harness.event') {
    console.log('← event', JSON.stringify(msg.params));
    return;
  }
  if (msg.id !== undefined) {
    pending.get(msg.id)?.resolve(msg.result ?? { error: msg.error });
  }
});

const init = await request('harness.init', {
  controlPlaneVersion: 3,
  pin: { commit: '7d442aafa985f9342134fac16c2ef41f03fb45c1', license: 'MIT', version: '0.9.8' },
  protocolVersion: 1,
  workspace: '/tmp/harness-smoke',
});
console.log('init →', JSON.stringify(init));
sessionId = init.sessionId;

const prompt = await request('session.prompt', { sessionId, text: 'Say hi' });
console.log('prompt →', JSON.stringify(prompt));
child.stdin.end();
child.kill();
process.exit(prompt?.stopReason === 'end_turn' ? 0 : 1);
