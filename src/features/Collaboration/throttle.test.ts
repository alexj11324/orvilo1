import { describe, expect, it, vi } from 'vitest';

import { createThrottledEmitter, cursorMovedEnough, MIN_CURSOR_DELTA_PX } from './throttle';

const fakeTimer = () => {
  const timers = new Map<number, { cb: () => void; dueAt: number }>();
  let nextId = 1;
  let now = 0;

  return {
    advance: (ms: number) => {
      now += ms;
      // Fire due timers in deadline order; a cb may schedule another timer.
      for (let fired = true; fired;) {
        fired = false;
        for (const [id, timer] of [...timers].sort((a, b) => a[1].dueAt - b[1].dueAt)) {
          if (timer.dueAt <= now) {
            timers.delete(id);
            timer.cb();
            fired = true;
            break;
          }
        }
      }
    },
    now: () => now,
    schedule: (cb: () => void, delay: number) => {
      const id = nextId++;
      timers.set(id, { cb, dueAt: now + delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    unschedule: (id: ReturnType<typeof setTimeout>) => {
      timers.delete(id as unknown as number);
    },
  };
};

describe('createThrottledEmitter', () => {
  it('emits immediately when the window is free', () => {
    const emit = vi.fn();
    const clock = fakeTimer();
    const t = createThrottledEmitter<number>(emit, {
      minIntervalMs: 60,
      now: clock.now,
      schedule: clock.schedule,
      unschedule: clock.unschedule,
    });

    t.push(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith(1);
  });

  it('coalesces bursts into one trailing emit with the freshest value', () => {
    const emit = vi.fn();
    const clock = fakeTimer();
    const t = createThrottledEmitter<number>(emit, {
      minIntervalMs: 60,
      now: clock.now,
      schedule: clock.schedule,
      unschedule: clock.unschedule,
    });

    t.push(1); // immediate
    t.push(2);
    t.push(3);
    t.push(4);
    expect(emit).toHaveBeenCalledTimes(1);

    clock.advance(60);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(4);
  });

  it('keeps emitting on each free window — motion never stalls', () => {
    const emit = vi.fn();
    const clock = fakeTimer();
    const t = createThrottledEmitter<number>(emit, {
      minIntervalMs: 60,
      now: clock.now,
      schedule: clock.schedule,
      unschedule: clock.unschedule,
    });

    t.push(1);
    clock.advance(60);
    t.push(2); // window free again → immediate
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(2);
  });

  it('cancel drops the pending trailing emit', () => {
    const emit = vi.fn();
    const clock = fakeTimer();
    const t = createThrottledEmitter<number>(emit, {
      minIntervalMs: 60,
      now: clock.now,
      schedule: clock.schedule,
      unschedule: clock.unschedule,
    });

    t.push(1);
    t.push(2);
    t.cancel();
    clock.advance(1_000);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

describe('cursorMovedEnough', () => {
  it('counts as moved when there is no previous point', () => {
    expect(cursorMovedEnough(null, { x: 0, y: 0 })).toBe(true);
  });

  it('ignores sub-threshold jitter', () => {
    const a = { x: 100, y: 100 };
    expect(cursorMovedEnough(a, { x: 100 + MIN_CURSOR_DELTA_PX - 1, y: 100 })).toBe(false);
    expect(cursorMovedEnough(a, { x: 100, y: 100 + MIN_CURSOR_DELTA_PX - 1 })).toBe(false);
  });

  it('fires once either axis crosses the delta', () => {
    const a = { x: 100, y: 100 };
    expect(cursorMovedEnough(a, { x: 100 + MIN_CURSOR_DELTA_PX, y: 100 })).toBe(true);
    expect(cursorMovedEnough(a, { x: 100, y: 100 + MIN_CURSOR_DELTA_PX })).toBe(true);
  });
});
