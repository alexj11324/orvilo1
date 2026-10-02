/**
 * Prompt-cache keep-alive scheduler.
 *
 * After an ACP turn settles, the owning session holds the child process open
 * and this controller sends an inert `session/prompt` turn on the SAME ACP
 * session just under the provider's cache TTL — refreshing the provider-side
 * cache chain of that session's prefix (a differently-shaped request builds
 * a separate chain and helps nothing, per the Cache TTL Warmer analysis).
 *
 * Disarm policy (fail-closed, CacheWarden-style):
 *   - `window`      — hard cap on keep-alive residency
 *   - `breakeven`   — ping spend reached one prefix rewrite (policy-derived)
 *   - `ping_failed` — the inert turn errored or timed out
 *   - `activity`    — a real turn is being dispatched (host retires the keeper)
 *   - `closed`      — host-initiated shutdown / interrupt
 *   - `error`       — session entered an error state
 *
 * The class is timer-agnostic: inject a clock for deterministic tests.
 */

export type CacheKeepaliveDisarmReason =
  'activity' | 'breakeven' | 'closed' | 'error' | 'ping_failed' | 'window';

export interface CacheKeepaliveClock {
  clearTimeout: (timer: unknown) => void;
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
}

const defaultClock: CacheKeepaliveClock = {
  clearTimeout: (timer) => clearTimeout(timer as NodeJS.Timeout),
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  },
};

export interface CacheKeepaliveControllerOptions {
  clock?: CacheKeepaliveClock;
  /** Break-even cap: pings stop paying once count reaches one rewrite. */
  maxPings: number;
  /** Hard cap on armed residency. */
  maxWindowMs: number;
  onDisarm: (reason: CacheKeepaliveDisarmReason) => void;
  pingIntervalMs: number;
  /** Sends one inert turn; resolves false when the ping failed. */
  sendPing: () => Promise<boolean>;
}

export class CacheKeepaliveController {
  private readonly clock: CacheKeepaliveClock;
  private disposed = false;
  private pingsSent = 0;
  private timer?: unknown;
  private windowStartedAt?: number;

  constructor(private readonly options: CacheKeepaliveControllerOptions) {
    this.clock = options.clock ?? defaultClock;
  }

  /** True while timers are live — the child is being held warm. */
  get armed(): boolean {
    return !this.disposed;
  }

  /** Inert turns successfully sent so far. */
  get pings(): number {
    return this.pingsSent;
  }

  /** Wall-clock deadline for residency (for runtime-status `idleDeadlineAt`). */
  get windowEndsAt(): number | undefined {
    return this.windowStartedAt === undefined
      ? undefined
      : this.windowStartedAt + this.options.maxWindowMs;
  }

  /** Start the ping cadence. Idempotent. */
  arm(): void {
    if (this.disposed || this.windowStartedAt !== undefined) return;
    this.windowStartedAt = this.clock.now();
    this.timer = this.clock.setTimeout(() => void this.tick(), this.options.pingIntervalMs);
  }

  /** Stop the scheduler and report the reason exactly once. */
  dispose(reason: CacheKeepaliveDisarmReason): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.options.onDisarm(reason);
  }

  private async tick(): Promise<void> {
    if (this.disposed || this.windowStartedAt === undefined) return;
    if (this.clock.now() - this.windowStartedAt >= this.options.maxWindowMs) {
      return this.dispose('window');
    }
    if (this.pingsSent >= this.options.maxPings) {
      return this.dispose('breakeven');
    }

    let ok: boolean;
    try {
      ok = await this.options.sendPing();
    } catch {
      ok = false;
    }
    if (this.disposed) return;
    if (!ok) return this.dispose('ping_failed');
    this.pingsSent += 1;

    if (this.clock.now() - this.windowStartedAt >= this.options.maxWindowMs) {
      return this.dispose('window');
    }
    if (this.pingsSent >= this.options.maxPings) {
      return this.dispose('breakeven');
    }
    this.timer = this.clock.setTimeout(() => void this.tick(), this.options.pingIntervalMs);
  }
}

/**
 * Inert prompt content: a real user-role turn (only a real request refreshes
 * the cache chain) that asks for the smallest possible response and no work.
 */
export const CACHE_KEEPALIVE_PROMPT_TEXT =
  '[orvilo cache keep-alive] Automated turn that keeps the provider prompt ' +
  'cache warm while the session idles. Do not call tools, read files, or ' +
  'perform any work. Reply with a single "." and nothing else.';

/** A ping should be fast but is bounded — a hung inert turn disarms instead. */
export const CACHE_KEEPALIVE_PROMPT_TIMEOUT_MS = 120_000;
