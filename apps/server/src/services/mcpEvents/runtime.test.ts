// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runMcpEventInboxSweep, scheduleMcpEventInboxSweep } from './runtime';

const mocks = vi.hoisted(() => ({
  db: {},
  enqueue: vi.fn(),
  pump: vi.fn(),
  health: vi.fn(),
  queue: true,
  wake: vi.fn(),
}));
vi.mock('@/envs/app', () => ({
  appEnv: {
    get enableQueueAgentRuntime() {
      return mocks.queue;
    },
  },
}));
vi.mock('./localLoop', () => ({ wakeLocalEventInboxLoop: mocks.wake }));
vi.mock('@/database/server', () => ({ getServerDB: vi.fn(async () => mocks.db) }));
vi.mock('@/libs/hatchet', () => ({ enqueueHatchetTask: mocks.enqueue }));
vi.mock('./workerHealth', () => ({ recordMcpEventWorkerHealth: mocks.health }));
vi.mock('./admission', () => ({ McpEventDispatchAdmissionService: class {} }));
vi.mock('./worker', () => ({
  McpEventWorker: class {
    pump = mocks.pump;
  },
}));

describe('MCP durable consumption task', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.queue = true;
    mocks.health.mockResolvedValue(undefined);
  });

  it('enqueues a wake-up with no event payload or callback credentials', async () => {
    mocks.enqueue.mockResolvedValue('durable-task');
    expect(await scheduleMcpEventInboxSweep()).toBe('durable-task');
    expect(mocks.enqueue).toHaveBeenCalledWith('orvilo-mcp-event-inbox-sweep', {});
    expect(mocks.pump).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it('records readiness only after the worker actually finishes its SQL sweep', async () => {
    const result = { claimed: 0, completed: 0, retried: 0 };
    mocks.pump.mockResolvedValue(result);
    expect(await runMcpEventInboxSweep()).toEqual(result);
    expect(mocks.pump).toHaveBeenCalledOnce();
    expect(mocks.health).toHaveBeenCalledWith('ready');
    expect(mocks.health.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.pump.mock.invocationCallOrder[0],
    );
  });

  it('wakes the shared inbox locally without requiring Hatchet or waiting for device startup', async () => {
    mocks.queue = false;
    expect(await scheduleMcpEventInboxSweep()).toBe('local-event-inbox');
    expect(mocks.wake).toHaveBeenCalledOnce();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.pump).not.toHaveBeenCalled();
  });

  it('does not mark a sweep with lost or timed-out leases healthy', async () => {
    mocks.pump.mockResolvedValue({ claimed: 1, completed: 0, retried: 0 });
    await runMcpEventInboxSweep();
    expect(mocks.health).toHaveBeenCalledWith('unavailable');
  });

  it('surfaces failure for durable task retry and records unavailable', async () => {
    mocks.pump.mockRejectedValue(new Error('database unavailable'));
    await expect(runMcpEventInboxSweep()).rejects.toThrow('database unavailable');
    expect(mocks.health).toHaveBeenCalledWith('unavailable');
  });
});
