import { describe, expect, it, vi } from 'vitest';

import {
  type CacheKeepaliveClock,
  CacheKeepaliveController,
  type CacheKeepaliveDisarmReason,
} from './cacheKeepalive';

/** Manual clock: timers are recorded and fired by the test. */
const createFakeClock = () => {
  let now = 0;
  let pending: { callback: () => void; fireAt: number } | undefined;
  const clock: CacheKeepaliveClock = {
    clearTimeout: () => {
      pending = undefined;
    },
    now: () => now,
    setTimeout: (callback, delayMs) => {
      pending = { callback, fireAt: now + delayMs };
      return pending;
    },
  };
  return {
    advance: (ms: number) => {
      now += ms;
    },
    clock,
    /** Fire the pending timer, if any. */
    fire: () => {
      const timer = pending;
      pending = undefined;
      timer?.callback();
    },
    hasPending: () => pending !== undefined,
    pendingFireAt: () => pending?.fireAt,
  };
};

const createController = ({
  clock = createFakeClock().clock,
  maxPings = 3,
  maxWindowMs = 10_000,
  onDisarm = vi.fn(),
  pingIntervalMs = 1_000,
  sendPing = vi.fn(async () => true),
}: {
  clock?: CacheKeepaliveClock;
  maxPings?: number;
  maxWindowMs?: number;
  onDisarm?: (reason: CacheKeepaliveDisarmReason) => void;
  pingIntervalMs?: number;
  sendPing?: () => Promise<boolean>;
} = {}) => {
  const controller = new CacheKeepaliveController({
    clock,
    maxPings,
    maxWindowMs,
    onDisarm,
    pingIntervalMs,
    sendPing,
  });
  return { controller, onDisarm, sendPing };
};

describe('CacheKeepaliveController', () => {
  it('arms the first ping at the configured interval and reports window end', () => {
    const fake = createFakeClock();
    const { controller, sendPing } = createController({ clock: fake.clock });

    controller.arm();

    expect(controller.armed).toBe(true);
    expect(fake.hasPending()).toBe(true);
    expect(fake.pendingFireAt()).toBe(1_000);
    expect(controller.windowEndsAt).toBe(10_000);
    expect(sendPing).not.toHaveBeenCalled();
  });

  it('pings on cadence, counts them, and re-arms', async () => {
    const fake = createFakeClock();
    const { controller, sendPing } = createController({ clock: fake.clock });
    controller.arm();

    fake.fire();
    await vi.waitFor(() => expect(sendPing).toHaveBeenCalledTimes(1));
    expect(controller.pings).toBe(1);
    expect(controller.armed).toBe(true);
    expect(fake.hasPending()).toBe(true);
  });

  it('disarms at break-even once the ping count reaches maxPings', async () => {
    const fake = createFakeClock();
    const onDisarm = vi.fn();
    const { controller, sendPing } = createController({
      clock: fake.clock,
      maxPings: 2,
      onDisarm,
    });
    controller.arm();

    fake.fire();
    await vi.waitFor(() => expect(sendPing).toHaveBeenCalledTimes(1));
    fake.fire();
    await vi.waitFor(() => expect(onDisarm).toHaveBeenCalledWith('breakeven'));

    expect(controller.pings).toBe(2);
    expect(controller.armed).toBe(false);
    expect(fake.hasPending()).toBe(false);
  });

  it('disarms at the residency cap before spending a ping past the window', async () => {
    const fake = createFakeClock();
    const onDisarm = vi.fn();
    const { sendPing } = createController({
      clock: fake.clock,
      maxPings: 10,
      maxWindowMs: 1_500,
      onDisarm,
      pingIntervalMs: 1_000,
    });
    const controller = new CacheKeepaliveController({
      clock: fake.clock,
      maxPings: 10,
      maxWindowMs: 1_500,
      onDisarm,
      pingIntervalMs: 1_000,
      sendPing,
    });
    controller.arm();

    fake.fire(); // t=0 → ping 1 at 1000 boundary? now=0 → fires, pings
    await vi.waitFor(() => expect(sendPing).toHaveBeenCalledTimes(1));
    fake.advance(2_000); // t=2000, next timer would be at 3000
    fake.fire(); // fires the re-armed tick early — window check: 2000 >= 1500
    expect(onDisarm).toHaveBeenCalledWith('window');
    expect(sendPing).toHaveBeenCalledTimes(1); // no ping beyond the cap
  });

  it('disarms without any ping when the interval overshoots the window', async () => {
    const fake = createFakeClock();
    const onDisarm = vi.fn();
    const { sendPing } = createController({
      clock: fake.clock,
      maxPings: 10,
      maxWindowMs: 500,
      onDisarm,
      pingIntervalMs: 1_000,
    });
    const controller = new CacheKeepaliveController({
      clock: fake.clock,
      maxPings: 10,
      maxWindowMs: 500,
      onDisarm,
      pingIntervalMs: 1_000,
      sendPing,
    });
    controller.arm();

    fake.advance(1_000);
    fake.fire();
    await vi.waitFor(() => expect(onDisarm).toHaveBeenCalledWith('window'));
    expect(sendPing).not.toHaveBeenCalled();
  });

  it('disarms on ping failure instead of retrying a dead session', async () => {
    const fake = createFakeClock();
    const onDisarm = vi.fn();
    createController({
      clock: fake.clock,
      onDisarm,
      sendPing: vi.fn(async () => false),
    }).controller.arm();

    fake.fire();
    await vi.waitFor(() => expect(onDisarm).toHaveBeenCalledWith('ping_failed'));
  });

  it('disarms on a thrown ping error too', async () => {
    const fake = createFakeClock();
    const onDisarm = vi.fn();
    createController({
      clock: fake.clock,
      onDisarm,
      sendPing: vi.fn(async () => {
        throw new Error('session gone');
      }),
    }).controller.arm();

    fake.fire();
    await vi.waitFor(() => expect(onDisarm).toHaveBeenCalledWith('ping_failed'));
  });

  it('dispose is idempotent and clears the pending timer', () => {
    const fake = createFakeClock();
    const onDisarm = vi.fn();
    const { controller } = createController({ clock: fake.clock, onDisarm });
    controller.arm();

    controller.dispose('closed');
    controller.dispose('activity');

    expect(onDisarm).toHaveBeenCalledTimes(1);
    expect(onDisarm).toHaveBeenCalledWith('closed');
    expect(controller.armed).toBe(false);
    expect(fake.hasPending()).toBe(false);
  });

  it('a ping completing after dispose does not re-arm', async () => {
    const fake = createFakeClock();
    const onDisarm = vi.fn();
    let resolvePing: ((ok: boolean) => void) | undefined;
    const { controller } = createController({
      clock: fake.clock,
      onDisarm,
      sendPing: () =>
        new Promise<boolean>((resolve) => {
          resolvePing = resolve;
        }),
    });
    controller.arm();

    fake.fire();
    controller.dispose('closed');
    resolvePing?.(true);
    await Promise.resolve();

    expect(onDisarm).toHaveBeenCalledTimes(1);
    expect(fake.hasPending()).toBe(false);
    expect(controller.pings).toBe(0); // disposed before the ping could count
  });
});
