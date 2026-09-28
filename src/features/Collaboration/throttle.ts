/**
 * Send-side throttle for high-frequency presence updates. Leading emit when
 * the window is free, single trailing emit with the freshest value otherwise —
 * at ~15–20 Hz the receiver always sees motion, never a queue of stale
 * positions. `now`/`schedule` are injectable so the timing rules stay
 * unit-testable.
 */
export interface ThrottledEmitter<T> {
  cancel: () => void;
  push: (value: T) => void;
}

interface ThrottlerOptions {
  minIntervalMs: number;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  unschedule?: (handle: ReturnType<typeof setTimeout>) => void;
}

export const createThrottledEmitter = <T>(
  emit: (value: T) => void,
  options: ThrottlerOptions,
): ThrottledEmitter<T> => {
  const { minIntervalMs } = options;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const unschedule = options.unschedule ?? clearTimeout;

  let lastSentAt = Number.NEGATIVE_INFINITY;
  let pending: T | undefined;
  let hasPending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!hasPending) return;
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    lastSentAt = now();
    emit(value);
  };

  return {
    cancel: () => {
      if (timer !== null) unschedule(timer);
      timer = null;
      pending = undefined;
      hasPending = false;
    },
    push: (value: T) => {
      pending = value;
      hasPending = true;
      if (timer !== null) return;

      const elapsed = now() - lastSentAt;
      if (elapsed >= minIntervalMs) {
        flush();
        return;
      }
      timer = schedule(flush, minIntervalMs - elapsed);
    },
  };
};

/** Minimum pointer movement (px) that counts as "actually moving". */
export const MIN_CURSOR_DELTA_PX = 2;
/** Outbound cursor rate — 60ms ≈ 17Hz, inside the 15–20Hz contract window. */
export const CURSOR_SEND_INTERVAL_MS = 60;

/** Whether the pointer moved far enough to justify a wire update. */
export const cursorMovedEnough = (
  a: { x: number; y: number } | null,
  b: { x: number; y: number },
): boolean => {
  if (!a) return true;
  return Math.abs(a.x - b.x) >= MIN_CURSOR_DELTA_PX || Math.abs(a.y - b.y) >= MIN_CURSOR_DELTA_PX;
};
