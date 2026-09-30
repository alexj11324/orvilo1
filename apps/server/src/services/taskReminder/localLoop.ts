import { runTaskReminderSweep } from './sweep';

const SWEEP_INTERVAL_MS = 60_000;

interface TaskReminderLoopGlobal {
  __orviloTaskReminderLoopStarted?: boolean;
}

/**
 * Queue-free reminder delivery for runtimes that never see the Hatchet
 * worker (local dev, standalone Hono, the Next.js server). Fires once
 * immediately so reminders that came due while the process was down are
 * delivered on restart, then every 60s on an unref'd timer — it never keeps
 * a process alive.
 *
 * HMR-safe: re-evaluating the module (Next dev reloads, watcher restarts)
 * sees the global flag and never stacks a second interval. The Hatchet cron
 * may run alongside — delivery is deduped by (userId, dedupeKey).
 */
export const startTaskReminderLocalLoop = (): void => {
  const loopGlobal = globalThis as TaskReminderLoopGlobal;
  if (loopGlobal.__orviloTaskReminderLoopStarted) return;
  loopGlobal.__orviloTaskReminderLoopStarted = true;

  const tick = async () => {
    try {
      await runTaskReminderSweep();
    } catch (error) {
      console.error('[task-reminder-loop] sweep failed:', error);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), SWEEP_INTERVAL_MS);
  timer.unref();
};
