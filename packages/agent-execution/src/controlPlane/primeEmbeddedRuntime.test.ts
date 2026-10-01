// @vitest-environment node
import { isRecord } from '@orvilo/utils/object';
import { expect, it } from 'vitest';

import type { ExecutionFence, InferenceEvent } from './contracts';
import {
  BROKER_CANCEL_METHOD,
  BROKER_EVENT_NOTIFICATION,
  BROKER_INFER_METHOD,
  HARNESS_ABORT_METHOD,
  HARNESS_EVENT_NOTIFICATION,
  HARNESS_INIT_METHOD,
  HARNESS_PROMPT_METHOD,
  HARNESS_PROTOCOL_VERSION,
} from './harnessProtocol';
import type { HarnessChannel, HarnessReverseHandler } from './harnessTransport';
import { unavailableProcessTreeSupervisor } from './isolation';
import type { PrimeEmbeddedRuntimeOptions } from './primeEmbeddedRuntime';
import { PRIME_EMBEDDED_PIN, PrimeEmbeddedRuntime } from './primeEmbeddedRuntime';

const fence: ExecutionFence = {
  tenantId: 't',
  principalId: 'p',
  taskId: 'task',
  grantId: 'g',
  ownerId: 'o',
  leaseId: 'l',
  epoch: 1,
  policyRevision: 1,
  stateRevision: 1,
};

const okIsolation = (treeId = 'tree') => ({
  supervisorId: 's',
  treeId,
  enforced: true,
  filesystem: true,
  network: true,
  processes: true,
  sanitizedEnvironment: true,
  credentialsExcluded: true,
});

const okProof = (treeId: string, at = 100) => ({
  supervisorId: 's',
  treeId,
  observedAt: at,
  remainingProcesses: 0,
  pendingActions: 0,
});

interface FakeChannel extends HarnessChannel {
  closedCount: number;
  notifications: ((notification: { method: string; params: unknown }) => void)[];
  notified: { method: string; params: unknown }[];
  requests: { method: string; params: unknown }[];
  reverseHandler: HarnessReverseHandler | undefined;
}

const fakeChannel = (
  requestImpl?: (method: string, params: unknown) => Promise<unknown>,
): FakeChannel => {
  const channel: FakeChannel = {
    notifications: [],
    notified: [],
    requests: [],
    closedCount: 0,
    reverseHandler: undefined,
    async request(method, params) {
      channel.requests.push({ method, params });
      if (requestImpl) return requestImpl(method, params);
      if (method === HARNESS_INIT_METHOD)
        return {
          protocolVersion: HARNESS_PROTOCOL_VERSION,
          sessionId: 'session-1',
          pin: {
            commit: PRIME_EMBEDDED_PIN.commit,
            version: PRIME_EMBEDDED_PIN.version,
            license: PRIME_EMBEDDED_PIN.license,
          },
          capabilities: { prompt: true, stream: true, cancel: true, tools: [], requests: [] },
        };
      return { stopReason: 'end_turn' };
    },
    notify(method, params) {
      channel.notified.push({ method, params });
    },
    subscribe(listener) {
      channel.notifications.push(listener);
      return () => {
        channel.notifications.splice(channel.notifications.indexOf(listener), 1);
      };
    },
    setReverseHandler(handler) {
      channel.reverseHandler = handler;
    },
    close() {
      channel.closedCount++;
    },
  };
  return channel;
};

const emit = (channel: FakeChannel, params: unknown) => {
  for (const listener of channel.notifications)
    listener({ method: HARNESS_EVENT_NOTIFICATION, params });
};

const makeRuntime = (
  overrides: {
    channel?: FakeChannel;
    authorize?: PrimeEmbeddedRuntimeOptions['authorize'];
    terminated?: string[];
    inferenceBroker?: PrimeEmbeddedRuntimeOptions['inferenceBroker'];
    buildInferenceRequest?: PrimeEmbeddedRuntimeOptions['buildInferenceRequest'];
  } = {},
) => {
  const channel = overrides.channel ?? fakeChannel();
  const terminated = overrides.terminated ?? [];
  const runtime = new PrimeEmbeddedRuntime({
    artifact: '/opt/orvilo/harness.mjs',
    executable: '/usr/local/bin/node',
    home: '/tmp/home',
    temp: '/tmp/tmp',
    now: () => 100,
    inferenceBroker: overrides.inferenceBroker,
    buildInferenceRequest: overrides.buildInferenceRequest,
    async authorize() {
      return { ok: true, value: true };
    },
    async verifyArtifact(artifact, pin) {
      expect(artifact).toBe('/opt/orvilo/harness.mjs');
      expect(pin).toEqual(PRIME_EMBEDDED_PIN);
      return { ok: true, value: true };
    },
    supervisor: {
      async launch() {
        return { ok: true, value: okIsolation() };
      },
      async terminate(treeId) {
        terminated.push(treeId);
        return { ok: true, value: okProof(treeId) };
      },
    },
    async connect() {
      return channel;
    },
    ...(overrides.authorize ? { authorize: overrides.authorize } : {}),
  });
  return { channel, runtime, terminated };
};

it('fails closed without a supervisor and never advertises resume', async () => {
  const runtime = new PrimeEmbeddedRuntime();
  expect(await runtime.start({ fence, workspace: '/workspace' })).toMatchObject({
    ok: false,
    error: { code: 'isolation_unavailable' },
  });
  expect(runtime.capabilities()).toMatchObject({
    resume: 'none',
    loadSession: false,
    isolation: 'unavailable',
    prompt: false,
  });
});

it('rejects malformed fence before calling authority or launching', async () => {
  const runtime = new PrimeEmbeddedRuntime({
    artifact: '/harness.mjs',
    executable: '/usr/local/bin/node',
    home: '/tmp',
    temp: '/tmp',
    supervisor: unavailableProcessTreeSupervisor,
    async authorize() {
      throw new Error('must not call');
    },
    async connect() {
      throw new Error('must not call');
    },
    async verifyArtifact() {
      throw new Error('must not call');
    },
  });
  await expect(
    runtime.start({ workspace: '/workspace', fence: null as unknown as ExecutionFence }),
  ).resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } });
});

it.each([
  ['wrong protocolVersion', { protocolVersion: 2 }],
  ['wrong pin commit', { pin: { commit: 'deadbeef', version: '0.9.8', license: 'MIT' } }],
  [
    'non-empty tools',
    { capabilities: { prompt: true, stream: true, cancel: true, tools: ['bash'], requests: [] } },
  ],
  ['missing sessionId', { sessionId: '' }],
])('rejects malformed handshake: %s', async (_label, mutation) => {
  const channel = fakeChannel(async (method) => {
    if (method === HARNESS_INIT_METHOD)
      return {
        protocolVersion: HARNESS_PROTOCOL_VERSION,
        sessionId: 'session-1',
        pin: {
          commit: PRIME_EMBEDDED_PIN.commit,
          version: PRIME_EMBEDDED_PIN.version,
          license: PRIME_EMBEDDED_PIN.license,
        },
        capabilities: { prompt: true, stream: true, cancel: true, tools: [], requests: [] },
        ...(mutation as object),
      };
    return {};
  });
  const terminated: string[] = [];
  const { runtime } = makeRuntime({ channel, terminated });
  const result = await runtime.start({ fence, workspace: '/workspace' });
  expect(result).toMatchObject({ ok: false, error: { code: 'unsupported_capability' } });
  expect(terminated).toEqual(['tree']);
  expect(channel.closedCount).toBeGreaterThan(0);
});

it('round-trips a prompt: text deltas stream, end_turn closes the turn', async () => {
  const channel = fakeChannel(async (method) => {
    if (method === HARNESS_INIT_METHOD)
      return {
        protocolVersion: HARNESS_PROTOCOL_VERSION,
        sessionId: 'session-1',
        pin: {
          commit: PRIME_EMBEDDED_PIN.commit,
          version: PRIME_EMBEDDED_PIN.version,
          license: PRIME_EMBEDDED_PIN.license,
        },
        capabilities: { prompt: true, stream: true, cancel: true, tools: [], requests: [] },
      };
    if (method === HARNESS_PROMPT_METHOD) {
      queueMicrotask(() => {
        emit(channel, { sessionId: 'session-1', event: { kind: 'text', text: 'hello ' } });
        emit(channel, { sessionId: 'session-1', event: { kind: 'text', text: 'world' } });
        emit(channel, {
          sessionId: 'session-1',
          event: { kind: 'usage', inputTokens: 10, outputTokens: 2 },
        });
      });
      return { stopReason: 'end_turn' };
    }
    return {};
  });
  const { runtime } = makeRuntime({ channel });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  const events = [];
  for await (const event of runtime.prompt(started.value, 'hi')) events.push(event);
  expect(events).toEqual([
    { type: 'text', sessionId: 'session-1', text: 'hello ' },
    { type: 'text', sessionId: 'session-1', text: 'world' },
    { type: 'usage', sessionId: 'session-1', inputTokens: 10, outputTokens: 2 },
    { type: 'turn-ended', sessionId: 'session-1', reason: 'end_turn' },
  ]);
  expect(runtime.capabilities()).toMatchObject({ prompt: true, stream: true });
});

it('fails closed on tool_execution events instead of flattening them', async () => {
  const channel = fakeChannel(async (method) => {
    if (method === HARNESS_INIT_METHOD)
      return {
        protocolVersion: HARNESS_PROTOCOL_VERSION,
        sessionId: 'session-1',
        pin: {
          commit: PRIME_EMBEDDED_PIN.commit,
          version: PRIME_EMBEDDED_PIN.version,
          license: PRIME_EMBEDDED_PIN.license,
        },
        capabilities: { prompt: true, stream: true, cancel: true, tools: [], requests: [] },
      };
    if (method === HARNESS_PROMPT_METHOD) {
      queueMicrotask(() => {
        emit(channel, {
          sessionId: 'session-1',
          event: { kind: 'tool-violation', toolName: 'bash', event: 'tool_execution_start' },
        });
      });
      return { stopReason: 'end_turn' };
    }
    return {};
  });
  const terminated: string[] = [];
  const { runtime } = makeRuntime({ channel, terminated });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  const events = [];
  for await (const event of runtime.prompt(started.value, 'hi')) events.push(event);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'error',
      error: expect.objectContaining({ code: 'unsupported_capability' }),
    }),
  );
  expect(terminated).toEqual(['tree']);
});

it('denies broker.infer when no inference broker is wired', async () => {
  const channel = fakeChannel();
  const { runtime } = makeRuntime({ channel });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  const outcome = channel.reverseHandler?.(BROKER_INFER_METHOD, {
    sessionId: 'session-1',
    request: {
      requestId: 'r1',
      modelRoute: 'orvilo-broker',
      messages: [{ role: 'user', content: 'hi' }],
      maxOutputTokens: 100,
    },
  });
  expect(outcome).toEqual({
    error: { code: -32603, message: 'Inference broker unavailable' },
  });
});

it('rejects broker.infer params that fail validation or name another session', async () => {
  const channel = fakeChannel();
  const { runtime } = makeRuntime({ channel });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  expect(
    channel.reverseHandler?.(BROKER_INFER_METHOD, { sessionId: 'other', request: {} }),
  ).toEqual({ error: { code: -32602, message: 'Invalid broker.infer params' } });
  expect(
    channel.reverseHandler?.(BROKER_INFER_METHOD, {
      sessionId: 'other',
      request: {
        requestId: 'r1',
        modelRoute: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        maxOutputTokens: 1,
      },
    }),
  ).toEqual({ error: { code: -32602, message: 'Broker session mismatch' } });
});

it('pins initModel into the handshake for the runner model registry', async () => {
  const channel = fakeChannel();
  const terminated: string[] = [];
  const runtime = new PrimeEmbeddedRuntime({
    artifact: '/harness.mjs',
    executable: '/usr/local/bin/node',
    home: '/tmp',
    temp: '/tmp',
    now: () => 100,
    initModel: { id: 'claude-sonnet-4-5', maxOutputTokens: 4096 },
    async authorize() {
      return { ok: true, value: true };
    },
    async verifyArtifact() {
      return { ok: true, value: true };
    },
    supervisor: {
      async launch() {
        return { ok: true, value: okIsolation() };
      },
      async terminate(treeId) {
        terminated.push(treeId);
        return { ok: true, value: okProof(treeId) };
      },
    },
    async connect() {
      return channel;
    },
  });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  const init = channel.requests.find((r) => r.method === HARNESS_INIT_METHOD);
  expect(init?.params).toMatchObject({
    model: { id: 'claude-sonnet-4-5', maxOutputTokens: 4096 },
  });
  if (started.ok) await runtime.cancel(started.value);
});

it('streams broker events to the runner after a valid broker.infer', async () => {
  const channel = fakeChannel();
  const events: InferenceEvent[] = [
    { type: 'text', text: 'hi ' },
    { type: 'usage', inputTokens: 1, outputTokens: 1 },
  ];
  const { runtime } = makeRuntime({
    channel,
    inferenceBroker: {
      async *infer() {
        for (const e of events) yield e;
      },
    },
  });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  const outcome = channel.reverseHandler?.(BROKER_INFER_METHOD, {
    sessionId: 'session-1',
    request: {
      requestId: 'r1',
      modelRoute: 'orvilo-broker',
      messages: [{ role: 'user', content: 'hi' }],
      maxOutputTokens: 100,
    },
  });
  expect(outcome).toEqual({ result: { requestId: 'r1', accepted: true } });
  // Let the async pump drain.
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(channel.notified).toEqual([
    { method: BROKER_EVENT_NOTIFICATION, params: { requestId: 'r1', event: events[0] } },
    { method: BROKER_EVENT_NOTIFICATION, params: { requestId: 'r1', event: events[1] } },
    { method: BROKER_EVENT_NOTIFICATION, params: { requestId: 'r1', event: { type: 'end' } } },
  ]);
});

it('cancel kills the tree and produces a validated QuiescenceProof', async () => {
  const channel = fakeChannel();
  const terminated: string[] = [];
  const { runtime } = makeRuntime({ channel, terminated });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  const cancelled = await runtime.cancel(started.value);
  expect(cancelled.ok).toBe(true);
  if (!cancelled.ok) return;
  expect(cancelled.value).toMatchObject({ treeId: 'tree', supervisorId: 's' });
  expect(terminated).toEqual(['tree']);
  expect(channel.closedCount).toBeGreaterThan(0);
  expect(channel.notified.some((n) => n.method === HARNESS_ABORT_METHOD)).toBe(true);
});

it('rejects prompts with a stale fence', async () => {
  const channel = fakeChannel();
  const { runtime } = makeRuntime({ channel });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  const stale = {
    ...started.value,
    fence: { ...started.value.fence, leaseId: 'different' },
  };
  const events = [];
  for await (const event of runtime.prompt(stale, 'hi')) events.push(event);
  expect(events).toEqual([
    expect.objectContaining({
      type: 'error',
      error: expect.objectContaining({ code: 'stale_fence' }),
    }),
  ]);
});

it('keeps one session when concurrent starts return the same ID across final admission', async () => {
  const calls = new Map<string, number>();
  const terminated: string[] = [];
  let launched = 0;
  let arrivals = 0;
  let release!: () => void;
  const finalAdmissionGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runtime = new PrimeEmbeddedRuntime({
    artifact: '/harness.mjs',
    executable: '/usr/local/bin/node',
    home: '/tmp',
    temp: '/tmp',
    runtimeWorkspace: '/isolated-workspace',
    now: () => 100,
    async authorize(candidate) {
      const count = (calls.get(candidate.ownerId) ?? 0) + 1;
      calls.set(candidate.ownerId, count);
      if (count === 3) {
        if (++arrivals === 2) release();
        await finalAdmissionGate;
      }
      return { ok: true, value: true };
    },
    async verifyArtifact() {
      return { ok: true, value: true };
    },
    supervisor: {
      async launch() {
        return { ok: true, value: okIsolation(`tree-${++launched}`) };
      },
      async terminate(treeId) {
        terminated.push(treeId);
        return { ok: true, value: okProof(treeId) };
      },
    },
    async connect() {
      return fakeChannel(async (method, params) => {
        if (method === HARNESS_INIT_METHOD) {
          expect(params).toMatchObject({ workspace: '/isolated-workspace' });
          return {
            protocolVersion: HARNESS_PROTOCOL_VERSION,
            sessionId: 'collision',
            pin: {
              commit: PRIME_EMBEDDED_PIN.commit,
              version: PRIME_EMBEDDED_PIN.version,
              license: PRIME_EMBEDDED_PIN.license,
            },
            capabilities: { prompt: true, stream: true, cancel: true, tools: [], requests: [] },
          };
        }
        return {};
      });
    },
  });
  const outcomes = await Promise.all([
    runtime.start({ fence, workspace: '/workspace' }),
    runtime.start({ fence: { ...fence, ownerId: 'other' }, workspace: '/workspace' }),
  ]);
  expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
  expect(outcomes.filter((result) => !result.ok)).toHaveLength(1);
  expect(terminated).toHaveLength(1);
  const winner = outcomes.find((result) => result.ok);
  if (!winner?.ok) throw new Error('Missing winning session');
  expect((await runtime.shutdown(winner.value)).ok).toBe(true);
  expect(new Set(terminated)).toEqual(new Set(['tree-1', 'tree-2']));
});

it('broker.cancel unwinds the in-flight backend stream immediately', async () => {
  const channel = fakeChannel();
  let returned = false;
  const { runtime } = makeRuntime({
    channel,
    inferenceBroker: {
      infer() {
        return {
          [Symbol.asyncIterator]() {
            let sent = 0;
            return {
              async next() {
                // Events only while the pump asks; cancel must not wait for one.
                sent += 1;
                if (sent === 1) return { done: false, value: { type: 'text', text: 'partial' } };
                return new Promise<IteratorResult<InferenceEvent>>(() => {});
              },
              async return() {
                returned = true;
                return { done: true, value: undefined };
              },
            };
          },
        };
      },
    },
  });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  const outcome = channel.reverseHandler?.(BROKER_INFER_METHOD, {
    sessionId: 'session-1',
    request: {
      requestId: 'r1',
      modelRoute: 'orvilo-broker',
      messages: [{ role: 'user', content: 'hi' }],
      maxOutputTokens: 100,
    },
  });
  expect(outcome).toEqual({ result: { requestId: 'r1', accepted: true } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  channel.reverseHandler?.(BROKER_CANCEL_METHOD, { requestId: 'r1' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(returned).toBe(true);
  // No dangling 'end' after cancellation.
  expect(
    channel.notified.some(
      (n) =>
        n.method === BROKER_EVENT_NOTIFICATION &&
        isRecord(n.params) &&
        isRecord(n.params.event) &&
        n.params.event.type === 'end',
    ),
  ).toBe(false);
});

it('session cancel wakes in-flight infer pumps before closing the channel', async () => {
  const channel = fakeChannel();
  let returned = false;
  const terminated: string[] = [];
  const { runtime } = makeRuntime({
    channel,
    terminated,
    inferenceBroker: {
      infer() {
        return {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                return new Promise<IteratorResult<InferenceEvent>>(() => {});
              },
              async return() {
                returned = true;
                return { done: true, value: undefined };
              },
            };
          },
        };
      },
    },
  });
  const started = await runtime.start({ fence, workspace: '/workspace' });
  expect(started.ok).toBe(true);
  if (!started.ok) return;
  channel.reverseHandler?.(BROKER_INFER_METHOD, {
    sessionId: 'session-1',
    request: {
      requestId: 'r1',
      modelRoute: 'orvilo-broker',
      messages: [{ role: 'user', content: 'hi' }],
      maxOutputTokens: 100,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const cancelled = await runtime.cancel(started.value);
  expect(cancelled.ok).toBe(true);
  expect(returned).toBe(true);
  expect(terminated).toEqual(['tree']);
});
