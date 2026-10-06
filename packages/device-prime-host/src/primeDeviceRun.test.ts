/**
 * `openPrimeDeviceRun` launches the shipped runner through the real harness
 * protocol — the tests drive a fake child that answers NDJSON over real
 * streams, while artifact verification hashes real bytes from disk.
 */
import type { ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { HARNESS_PROTOCOL_VERSION } from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { PRIME_EMBEDDED_PIN } from '@orvilo/agent-execution/controlPlane/primeEmbeddedArtifact';
import type { PrimeRunDescriptor } from '@orvilo/device-gateway-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openPrimeDeviceRun } from './primeDeviceRun';

const RUNNER_SOURCE = 'console.log("runner");\n';
const RUNNER_SHA = createHash('sha256').update(RUNNER_SOURCE).digest('hex');

const noopLog = { error: vi.fn(), log: vi.fn() };

const descriptor = (overrides: Partial<PrimeRunDescriptor> = {}): PrimeRunDescriptor => ({
  artifact: {
    bytes: RUNNER_SOURCE.length,
    commit: PRIME_EMBEDDED_PIN.commit,
    license: PRIME_EMBEDDED_PIN.license,
    sha256: RUNNER_SHA,
    version: PRIME_EMBEDDED_PIN.version,
  },
  broker: { credential: 'op-jwt' },
  lease: { ttlMs: 60_000 },
  model: { id: 'test-model', maxOutputTokens: 4096 },
  subject: { dispatchId: 'disp-1', kind: 'task', taskId: 'task-1' },
  ...overrides,
});

interface FakeRunner {
  child: ChildProcess;
  /** Emit a runner→host request or notification frame. */
  emit: (frame: Record<string, unknown>) => void;
  /** Lines the host wrote to the runner (requests + notifications). */
  inbound: Array<Record<string, unknown>>;
}

/** A child that answers the harness NDJSON protocol like the real runner. */
const fakeRunner = (): FakeRunner => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const inbound: Array<Record<string, unknown>> = [];
  const child = Object.assign(emitter, {
    killed: false,
    pid: 999_999,
    stdin,
    stdout,
    stderr,
    kill: () => {
      Object.assign(child, { killed: true });
      setImmediate(() => emitter.emit('exit', 137, 'SIGKILL'));
      return true;
    },
  }) as unknown as ChildProcess;
  const emit = (frame: Record<string, unknown>): void => {
    stdout.write(`${JSON.stringify(frame)}\n`);
  };
  let buffer = '';
  stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end === -1) break;
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (line.length === 0) continue;
      const frame = JSON.parse(line) as Record<string, unknown>;
      inbound.push(frame);
      if (frame.method === 'harness.init') {
        emit({
          id: frame.id,
          jsonrpc: '2.0',
          result: {
            capabilities: {
              cancel: true,
              prompt: true,
              requests: ['broker.infer', 'broker.cancel'],
              stream: true,
              tools: [],
            },
            pin: {
              commit: PRIME_EMBEDDED_PIN.commit,
              license: PRIME_EMBEDDED_PIN.license,
              version: PRIME_EMBEDDED_PIN.version,
            },
            protocolVersion: HARNESS_PROTOCOL_VERSION,
            sessionId: 'sess-1',
          },
        });
      } else if (frame.method === 'session.prompt') {
        emit({ id: frame.id, jsonrpc: '2.0', result: { stopReason: 'end_turn' } });
      } else if (frame.method === 'session.abort') {
        emit({ id: frame.id, jsonrpc: '2.0', result: { ok: true } });
      } else if (frame.method === 'session.list') {
        emit({ id: frame.id, jsonrpc: '2.0', result: { sessions: ['sess-1', 'sess-old'] } });
      } else if (frame.method === 'session.resume') {
        emit({
          id: frame.id,
          jsonrpc: '2.0',
          result: {
            resumed: (frame.params as { resumeSessionId: string }).resumeSessionId === 'sess-old',
            sessionId: (frame.params as { resumeSessionId: string }).resumeSessionId,
          },
        });
      }
    }
  });
  return { child, emit, inbound };
};

const okFetch = (): typeof fetch =>
  (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

describe('openPrimeDeviceRun', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { force: true, recursive: true });
  });

  const stage = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'prime-device-test-'));
    dirs.push(dir);
    const artifact = path.join(dir, 'runner.mjs');
    await writeFile(artifact, RUNNER_SOURCE);
    return { artifact, dir };
  };

  it('verifies the real artifact digest, spawns the device executable, and activates', async () => {
    const { artifact, dir } = await stage();
    const runner = fakeRunner();
    const spawnImpl = vi.fn(() => runner.child);
    const posted: Array<{ body: unknown; url: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      posted.push({ body: JSON.parse(String(init?.body)), url: String(input) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor(),
      executable: '/usr/bin/node',
      fetchImpl,
      log: noopLog,
      operationId: 'op-1',
      spawnImpl: spawnImpl as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const run = opened.value;
    try {
      expect(spawnImpl).toHaveBeenCalledWith(
        '/usr/bin/node',
        [artifact, '--operation-id', 'op-1'],
        expect.objectContaining({ cwd: dir, detached: true }),
      );
      // The device supplies state dir + workdir — no /tmp/agent, no container paths.
      const initFrame = runner.inbound.find((frame) => frame.method === 'harness.init');
      expect(initFrame?.params).toMatchObject({ stateDir: `${dir}/state`, workspace: dir });
      expect(posted).toHaveLength(1);
      expect(posted[0]?.url).toBe('https://server.test/api/agent/prime-broker/activate');
      expect(posted[0]?.body).toMatchObject({
        artifact: { sha256: RUNNER_SHA },
        runtime: { supervisorId: 'orvilo-device-prime-host' },
        sessionId: 'sess-1',
      });
      expect(run.activation.sessionId).toBe('sess-1');
      expect(run.activation.treeId).toBe('device-pg-999999');
    } finally {
      await run.kill();
    }
  });

  it('fails closed on a tampered artifact before spawning anything', async () => {
    const { artifact, dir } = await stage();
    const spawnImpl = vi.fn();
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor({
        artifact: { ...descriptor().artifact, sha256: '0'.repeat(64) },
      }),
      executable: '/usr/bin/node',
      fetchImpl: okFetch(),
      log: noopLog,
      operationId: 'op-2',
      spawnImpl: spawnImpl as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(false);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('fails closed on drifted descriptor provenance (pin mismatch)', async () => {
    const { artifact, dir } = await stage();
    const spawnImpl = vi.fn();
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor({
        artifact: { ...descriptor().artifact, commit: 'f'.repeat(40) },
      }),
      executable: '/usr/bin/node',
      fetchImpl: okFetch(),
      log: noopLog,
      operationId: 'op-3',
      spawnImpl: spawnImpl as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(false);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('prompts the runner and streams harness events in order', async () => {
    const { artifact, dir } = await stage();
    const runner = fakeRunner();
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor(),
      executable: '/usr/bin/node',
      fetchImpl: okFetch(),
      log: noopLog,
      operationId: 'op-4',
      spawnImpl: (() => runner.child) as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const run = opened.value;
    try {
      runner.emit({
        jsonrpc: '2.0',
        method: 'harness.event',
        params: { event: { kind: 'text', text: 'hello' }, sessionId: 'sess-1' },
      });
      const iterator = run.events[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.value).toEqual({ kind: 'text', text: 'hello' });
      const builtinMcp = { operationId: 'op-4', url: 'http://127.0.0.1:4321/mcp?op=op-4' };
      const result = await run.prompt('do the thing', builtinMcp);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.stopReason).toBe('end_turn');
      const promptFrame = runner.inbound.find((frame) => frame.method === 'session.prompt');
      expect(promptFrame?.params).toMatchObject({
        builtinMcp,
        sessionId: 'sess-1',
        text: 'do the thing',
      });
    } finally {
      await run.kill();
    }
  });

  it('bridges broker.infer to the control surface and streams events back', async () => {
    const { artifact, dir } = await stage();
    const runner = fakeRunner();
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/activate')) return new Response('{}', { status: 200 });
      const body = JSON.parse(String(init?.body));
      const stream = [
        { event: { text: 'chunk', type: 'text' }, requestId: body.request.requestId },
        { event: { type: 'end' }, requestId: body.request.requestId },
      ]
        .map((line) => `${JSON.stringify(line)}\n`)
        .join('');
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor(),
      executable: '/usr/bin/node',
      fetchImpl,
      log: noopLog,
      operationId: 'op-5',
      spawnImpl: (() => runner.child) as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const run = opened.value;
    try {
      // Runner issues broker.infer; the host acks synchronously then pumps.
      runner.emit({
        id: 7,
        jsonrpc: '2.0',
        method: 'broker.infer',
        params: {
          request: { requestId: 'infer-1', maxOutputTokens: 10 },
          sessionId: 'sess-1',
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const events = runner.inbound.filter((frame) => frame.method === 'broker.event');
      const texts = events.map((frame) => (frame.params as { event: { type: string } }).event.type);
      expect(texts).toContain('text');
      expect(texts).toContain('end');
    } finally {
      await run.kill();
    }
  });

  it('kills the process group when the side-effect lease lapses', { timeout: 20_000 }, async () => {
    const { artifact, dir } = await stage();
    const runner = fakeRunner();
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor({ lease: { ttlMs: 30 } }),
      executable: '/usr/bin/node',
      fetchImpl: okFetch(),
      log: noopLog,
      operationId: 'op-6',
      spawnImpl: (() => runner.child) as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const run = opened.value;
    await run.leaseExpired;
    expect(runner.child.killed).toBe(true);
    const abortFrame = runner.inbound.find((frame) => frame.method === 'session.abort');
    expect(abortFrame).toBeTruthy();
  });

  it('spreads descriptor.init policy onto the harness.init handshake', async () => {
    const { artifact, dir } = await stage();
    const runner = fakeRunner();
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor({
        init: {
          goal: { objective: 'ship the fix' },
          rlm: { maxDepth: 2 },
          thinkingLevel: 'high',
          toolPolicy: { allowed: ['ipython'] },
        },
      }),
      executable: '/usr/bin/node',
      fetchImpl: okFetch(),
      log: noopLog,
      operationId: 'op-init',
      spawnImpl: (() => runner.child) as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const run = opened.value;
    try {
      const initFrame = runner.inbound.find((frame) => frame.method === 'harness.init');
      expect(initFrame?.params).toMatchObject({
        goal: { objective: 'ship the fix' },
        rlm: { maxDepth: 2 },
        thinkingLevel: 'high',
        toolPolicy: { allowed: ['ipython'] },
      });
    } finally {
      await run.kill();
    }
  });

  it('forwards session.list and session.resume to the runner', async () => {
    const { artifact, dir } = await stage();
    const runner = fakeRunner();
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor(),
      executable: '/usr/bin/node',
      fetchImpl: okFetch(),
      log: noopLog,
      operationId: 'op-resume',
      spawnImpl: (() => runner.child) as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const run = opened.value;
    try {
      const listed = await run.listSessions();
      expect(listed).toEqual({ ok: true, value: { sessions: ['sess-1', 'sess-old'] } });
      const resumed = await run.resume('sess-old');
      expect(resumed).toEqual({ ok: true, value: { resumed: true, sessionId: 'sess-old' } });
      const listFrame = runner.inbound.find((frame) => frame.method === 'session.list');
      expect(listFrame?.params).toMatchObject({ sessionId: 'sess-1' });
      const resumeFrame = runner.inbound.find((frame) => frame.method === 'session.resume');
      expect(resumeFrame?.params).toMatchObject({
        resumeSessionId: 'sess-old',
        sessionId: 'sess-1',
      });
    } finally {
      await run.kill();
    }
  });

  // ROOT CAUSE: the bridge captured the op's bound credential at open; a
  // resumed turn's `/infer` then presented the DEAD op's credential → 403.
  // `reactivate` must rotate the credential every later pump carries.
  it('rotates the bridge credential to the resuming op on reactivate', async () => {
    const { artifact, dir } = await stage();
    const runner = fakeRunner();
    const auths: Array<{ authorization?: string; url: string }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      auths.push({
        authorization: (init?.headers as Record<string, string> | undefined)?.authorization,
        url,
      });
      if (url.endsWith('/activate')) return new Response('{}', { status: 200 });
      return new Response(`${JSON.stringify({ event: { type: 'end' }, requestId: 'infer-r' })}\n`, {
        status: 200,
      });
    }) as typeof fetch;
    const opened = await openPrimeDeviceRun({
      artifact,
      brokerUrl: 'https://server.test/api/agent/prime-broker',
      descriptor: descriptor(),
      executable: '/usr/bin/node',
      fetchImpl,
      log: noopLog,
      operationId: 'op-7',
      spawnImpl: (() => runner.child) as unknown as typeof spawn,
      stateDir: `${dir}/state`,
      workspace: dir,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const run = opened.value;
    try {
      // A new operation resumes the session under its own bound credential.
      await expect(run.reactivate('op-2-jwt')).resolves.toMatchObject({ ok: true });
      runner.emit({
        id: 8,
        jsonrpc: '2.0',
        method: 'broker.infer',
        params: { request: { requestId: 'infer-r' }, sessionId: 'sess-1' },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const infer = auths.find((call) => call.url.endsWith('/infer'));
      expect(infer?.authorization).toBe('Bearer op-2-jwt');
      const reactivations = auths.filter((call) => call.url.endsWith('/activate'));
      expect(reactivations.at(-1)?.authorization).toBe('Bearer op-2-jwt');
    } finally {
      await run.kill();
    }
  });
});
