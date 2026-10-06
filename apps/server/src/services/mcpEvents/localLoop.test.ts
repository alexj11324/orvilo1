// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startLocalEventInboxLoop, wakeLocalEventInboxLoop } from './localLoop';

const mocks = vi.hoisted(() => ({ queue: false, sweep: vi.fn() }));
vi.mock('@/envs/app', () => ({
  appEnv: {
    get enableQueueAgentRuntime() {
      return mocks.queue;
    },
  },
}));
vi.mock('./runtime', () => ({ runMcpEventInboxSweep: mocks.sweep }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('__orviloEventInboxLoop', undefined);
  mocks.queue = false;
  mocks.sweep.mockReset().mockResolvedValue({ claimed: 0, completed: 0, retried: 0 });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('local event inbox consumption', () => {
  it('runs at boot and on receipt, with one periodic recovery loop across repeated startup', async () => {
    startLocalEventInboxLoop();
    startLocalEventInboxLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
    wakeLocalEventInboxLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.sweep).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.sweep).toHaveBeenCalledTimes(3);
  });

  it('does not overlap a pending sweep and recovers after that sweep fails', async () => {
    let fail: (error: Error) => void = () => {};
    mocks.sweep.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    startLocalEventInboxLoop();
    wakeLocalEventInboxLoop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.sweep).toHaveBeenCalledTimes(1);
    fail(new Error('disposable database unavailable'));
    await vi.advanceTimersByTimeAsync(0);
    expect(errorLog).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.sweep).toHaveBeenCalledTimes(2);
  });

  it('leaves queue deployments to their durable worker', async () => {
    mocks.queue = true;
    wakeLocalEventInboxLoop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.sweep).not.toHaveBeenCalled();
  });
});
