import { appEnv } from '@/envs/app';

import { runMcpEventInboxSweep } from './runtime';

interface EventInboxLoopGlobal {
  __orviloEventInboxLoop?: { tick: () => Promise<void> };
}

/** Queue-free hosts consume the same durable inbox and leases as the Hatchet worker. */
export function startLocalEventInboxLoop() {
  if (appEnv.enableQueueAgentRuntime) return;
  const state = globalThis as EventInboxLoopGlobal;
  if (state.__orviloEventInboxLoop) return;
  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      await runMcpEventInboxSweep();
    } catch {
      console.error('[event-inbox] Local sweep unavailable; durable receipts remain queued');
    } finally {
      inFlight = false;
    }
  };
  state.__orviloEventInboxLoop = { tick };
  void tick();
  const timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();
}

/** Receipt acknowledgement does not wait for dispatch or a device to start. */
export function wakeLocalEventInboxLoop() {
  startLocalEventInboxLoop();
  void (globalThis as EventInboxLoopGlobal).__orviloEventInboxLoop?.tick();
}
