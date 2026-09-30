// @vitest-environment node
import { expect, it } from 'vitest';

import type { ExecutionFence } from './contracts';
import { unavailableProcessTreeSupervisor } from './isolation';
import { PrimeExecutionRuntime } from './primeRuntime';

it('fails closed without a supervisor and never advertises resume', async () => {
  const runtime = new PrimeExecutionRuntime();
  expect(
    await runtime.start({ fence: {} as ExecutionFence, workspace: '/workspace' }),
  ).toMatchObject({ ok: false, error: { code: 'isolation_unavailable' } });
  expect(runtime.capabilities()).toMatchObject({
    resume: 'none',
    loadSession: false,
    isolation: 'unavailable',
  });
});
it('rejects malformed fence before calling authority or launching', async () => {
  const runtime = new PrimeExecutionRuntime({
    executable: '/prime',
    home: '/home/runtime',
    temp: '/tmp/runtime',
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

it.each(['rejected', 'invalid-reason'])(
  'terminates uncertain prompt outcome: %s',
  async (outcome) => {
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
    let terminated = 0;
    const runtime = new PrimeExecutionRuntime({
      executable: '/prime',
      home: '/runtime',
      temp: '/tmp/runtime',
      now: () => 100,
      async authorize() {
        return { ok: true, value: true };
      },
      async verifyArtifact() {
        return { ok: true, value: true };
      },
      supervisor: {
        async launch() {
          return {
            ok: true,
            value: {
              supervisorId: 's',
              treeId: 'tree',
              enforced: true,
              filesystem: true,
              network: true,
              processes: true,
              sanitizedEnvironment: true,
              credentialsExcluded: true,
            },
          };
        },
        async terminate() {
          terminated++;
          return {
            ok: false,
            error: { code: 'not_quiescent', message: 'test termination failure', retryable: false },
          };
        },
      },
      async connect() {
        return {
          close() {},
          subscribe() {
            return () => {};
          },
          async request(method) {
            if (method === 'initialize')
              return {
                protocolVersion: 1,
                agentInfo: { name: 'prime-agent', version: '0.9.8' },
                agentCapabilities: { loadSession: false },
              };
            if (method === 'session/new') return { sessionId: 'session' };
            if (outcome === 'rejected') throw new Error('lost connection');
            return { stopReason: 'unrecognized' };
          },
        };
      },
    });
    const started = await runtime.start({ fence, workspace: '/workspace' });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const events = [];
    for await (const event of runtime.prompt(started.value, 'hi')) events.push(event);
    expect(terminated).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code: 'not_quiescent' }),
      }),
    );
    const retry = [];
    for await (const event of runtime.prompt(started.value, 'hi')) retry.push(event);
    expect(retry).toContainEqual(
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code: 'invalid_request' }),
      }),
    );
  },
);

it('keeps one session when concurrent starts return the same ID across final admission', async () => {
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
  const calls = new Map<string, number>();
  const terminated: string[] = [];
  let launched = 0;
  let arrivals = 0;
  let release!: () => void;
  const finalAdmissionGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runtime = new PrimeExecutionRuntime({
    executable: '/prime',
    home: '/runtime',
    temp: '/tmp/runtime',
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
        return {
          ok: true,
          value: {
            supervisorId: 's',
            treeId: `tree-${++launched}`,
            enforced: true,
            filesystem: true,
            network: true,
            processes: true,
            sanitizedEnvironment: true,
            credentialsExcluded: true,
          },
        };
      },
      async terminate(treeId) {
        terminated.push(treeId);
        return {
          ok: true,
          value: {
            supervisorId: 's',
            treeId,
            observedAt: 100,
            remainingProcesses: 0,
            pendingActions: 0,
          },
        };
      },
    },
    async connect() {
      return {
        close() {},
        subscribe() {
          return () => {};
        },
        async request(method) {
          if (method === 'initialize')
            return {
              protocolVersion: 1,
              agentInfo: { name: 'prime-agent', version: '0.9.8' },
              agentCapabilities: { loadSession: false },
            };
          return { sessionId: 'collision' };
        },
      };
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
