// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';
import type * as runAdmissionModule from '@/server/services/heterogeneousAgent/runAdmission';

import { sweepDevicePrimeRunReconcile } from './index';

const mocks = vi.hoisted(() => ({
  completeOperation: vi.fn(),
  getSerializedHooks: vi.fn(() => []),
  messageUpdate: vi.fn(),
  publishAgentRuntimeEnd: vi.fn(),
  settleRunningOperation: vi.fn(async () => ({ status: 'settled' })),
  writeRemoteRunAdmission: vi.fn(async () => true),
}));

vi.mock('@/database/models/message', () => ({
  MessageModel: vi.fn(function () {
    return { update: mocks.messageUpdate };
  }),
}));
vi.mock('@/database/models/topic', () => ({
  TopicModel: vi.fn(function () {
    return { settleRunningOperation: mocks.settleRunningOperation };
  }),
}));
vi.mock('@/server/services/agentExecution/CompletionLifecycle', () => ({
  CompletionLifecycle: vi.fn(function () {
    return { completeOperation: mocks.completeOperation };
  }),
}));
vi.mock('@/server/modules/AgentExecution/factory', () => ({
  createStreamEventManager: vi.fn(() => ({
    publishAgentRuntimeEnd: mocks.publishAgentRuntimeEnd,
  })),
}));
vi.mock('@/server/services/agentExecution/hooks', () => ({
  hookDispatcher: { getSerializedHooks: mocks.getSerializedHooks },
}));
vi.mock('@/server/services/heterogeneousAgent/runAdmission', async (importOriginal) => {
  const actual = await importOriginal<typeof runAdmissionModule>();
  return { ...actual, writeRemoteRunAdmission: mocks.writeRemoteRunAdmission };
});

const dbOf = (rows: object[]) =>
  ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => rows }),
      }),
    }),
  }) as unknown as OrviloDatabase;

const admission = (overrides: Record<string, unknown> = {}) => ({
  channel: 'agent_run_request',
  deviceId: 'device-1',
  generation: 1,
  harness: 'prime',
  idempotencyKey: 'op-1',
  state: 'acknowledged',
  updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  ...overrides,
});

const operation = (overrides: Record<string, unknown> = {}) => ({
  agentId: null,
  createdAt: new Date(),
  id: 'op-1',
  metadata: { remoteAdmission: admission() },
  status: 'running',
  taskId: null,
  topicId: 'topic-1',
  updatedAt: new Date(),
  userId: 'user-1',
  workspaceId: null,
  ...overrides,
});

describe('sweepDevicePrimeRunReconcile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('settles an op whose admitted run never activated — the enqueue-ack swallow', async () => {
    // ROOT CAUSE: a device rejection after the enqueue-ack never reaches the
    // server, so the op stayed `running` forever. The sweep is the honest
    // convergence: stale admission + no activation record → terminal settle.
    const outcomes = await sweepDevicePrimeRunReconcile({
      db: dbOf([operation()]),
    });

    expect(outcomes).toEqual([{ operationId: 'op-1', outcome: 'settled_no_activation' }]);
    expect(mocks.writeRemoteRunAdmission).toHaveBeenCalledWith(
      expect.anything(),
      'op-1',
      expect.objectContaining({ errorCode: 'DEVICE_PRIME_NO_ACTIVATION', state: 'unknown' }),
    );
    expect(mocks.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'op-1' }),
      'error',
      expect.anything(),
    );
    expect(mocks.publishAgentRuntimeEnd).toHaveBeenCalled();
    expect(mocks.settleRunningOperation).toHaveBeenCalledWith('topic-1', 'op-1', 'active');
  });

  it('leaves a freshly admitted run alone — the activation window has not closed', async () => {
    const outcomes = await sweepDevicePrimeRunReconcile({
      db: dbOf([
        operation({
          metadata: {
            remoteAdmission: admission({
              updatedAt: new Date(Date.now() - 5_000).toISOString(),
            }),
          },
        }),
      ]),
    });

    expect(outcomes).toEqual([{ operationId: 'op-1', outcome: 'skipped', reason: 'live' }]);
    expect(mocks.completeOperation).not.toHaveBeenCalled();
  });

  it('settles an activated conversation run whose producer went stale', async () => {
    const outcomes = await sweepDevicePrimeRunReconcile({
      db: dbOf([
        operation({
          metadata: {
            devicePrime: { sessionId: 'sess-1' },
            remoteAdmission: admission({ state: 'running' }),
          },
          updatedAt: new Date(Date.now() - 30 * 60 * 1000),
        }),
      ]),
    });

    expect(outcomes).toEqual([{ operationId: 'op-1', outcome: 'settled_dead_execution' }]);
    expect(mocks.completeOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'op-1' }),
      'interrupted',
    );
  });

  it('leaves activated task-subject runs to the dispatch-recovery sweep', async () => {
    const outcomes = await sweepDevicePrimeRunReconcile({
      db: dbOf([
        operation({
          metadata: {
            devicePrime: { sessionId: 'sess-1' },
            remoteAdmission: admission({ state: 'running' }),
          },
          taskId: 'task-1',
          updatedAt: new Date(Date.now() - 30 * 60 * 1000),
        }),
      ]),
    });

    expect(outcomes).toEqual([{ operationId: 'op-1', outcome: 'skipped', reason: 'live' }]);
    expect(mocks.completeOperation).not.toHaveBeenCalled();
  });

  it('does not touch an activated live run', async () => {
    const outcomes = await sweepDevicePrimeRunReconcile({
      db: dbOf([
        operation({
          metadata: {
            devicePrime: { sessionId: 'sess-1' },
            remoteAdmission: admission({ state: 'running' }),
          },
        }),
      ]),
    });

    expect(outcomes).toEqual([{ operationId: 'op-1', outcome: 'skipped', reason: 'live' }]);
    expect(mocks.completeOperation).not.toHaveBeenCalled();
  });
});
