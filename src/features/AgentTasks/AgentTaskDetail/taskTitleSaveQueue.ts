import type { TaskStore } from '@/store/task';

const DEBOUNCE_MS = 300;
const MAX_AUTO_RETRIES = 3;

type UpdateTask = TaskStore['updateTask'];

interface PendingTitleEdit {
  editSequence: number;
  value: string;
}

interface TitleSaveEntry {
  /** editSequence of the request currently on the wire, if any. */
  inFlight: number | null;
  /** Newest captured edit that has not been acknowledged yet. */
  pending: PendingTitleEdit | null;
  retryAttempts: number;
  timer?: ReturnType<typeof setTimeout> | undefined;
}

/**
 * Per-task queue for title autosaves.
 *
 * Every keystroke captures `{ taskId, value, editSequence }` at input time,
 * so a save can never pair a stale value with whatever task happens to be
 * mounted when it fires — the debounce's closure carries the edit's own
 * identity, not the component's. Entries are keyed by taskId, which makes
 * `TaskDetailTitleInput` safe to share across detail hosts and route swaps
 * without a remount: task A's pending write is stored under A no matter
 * where focus or the route goes next.
 *
 * The queue is module-scoped so a scheduled save survives the unmount of the
 * input that produced it (e.g. navigating away inside the debounce window or
 * switching to another task's cached detail).
 */
export class TaskTitleSaveQueue {
  #editSequence = 0;
  #entries = new Map<string, TitleSaveEntry>();
  #listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #notify = () => this.#listeners.forEach((listener) => listener());

  /**
   * True while an unsent or unacknowledged edit exists for the task — the
   * draft on screen is newer than the store's `name`, including after a
   * failed save rolled the optimistic title back.
   */
  hasPending = (taskId: string): boolean => {
    const entry = this.#entries.get(taskId);
    return Boolean(entry && (entry.pending || entry.inFlight !== null));
  };

  /** A captured draft can be sent now, rather than duplicating an in-flight write. */
  canRetry = (taskId: string): boolean => {
    const entry = this.#entries.get(taskId);
    return Boolean(entry?.pending && entry.inFlight === null);
  };

  /**
   * Record a keystroke-time edit. The taskId and a monotonically increasing
   * edit sequence are bound to the value now — never read later — so the
   * identity that saves is always the identity that was typed into.
   */
  schedule = (taskId: string, value: string, updateTask: UpdateTask): void => {
    const entry = this.#entry(taskId);
    entry.pending = { editSequence: ++this.#editSequence, value };
    entry.retryAttempts = 0;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void this.#flush(taskId, updateTask);
    }, DEBOUNCE_MS);
    this.#notify();
  };

  /**
   * Send the pending edit immediately — blur, task switch, or unmount. A
   * flush never cancels anything: without a pending edit it is a no-op, with
   * one it promotes it ahead of the debounce so the last keystrokes are not
   * lost on the way out.
   */
  flush = (taskId: string, updateTask: UpdateTask): void => {
    const entry = this.#entries.get(taskId);
    if (entry?.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    void this.#flush(taskId, updateTask);
  };

  #entry = (taskId: string): TitleSaveEntry => {
    let entry = this.#entries.get(taskId);
    if (!entry) {
      entry = { inFlight: null, pending: null, retryAttempts: 0 };
      this.#entries.set(taskId, entry);
    }
    return entry;
  };

  #flush = async (taskId: string, updateTask: UpdateTask): Promise<void> => {
    const entry = this.#entries.get(taskId);
    // Serialized per task: one request on the wire at a time keeps the
    // server's last-writer-wins order identical to the user's edit order.
    if (!entry || entry.inFlight !== null || !entry.pending) return;
    const pending = entry.pending;
    entry.inFlight = pending.editSequence;
    this.#notify();
    try {
      await updateTask(taskId, { name: pending.value });
      // Only the edit this request carried is consumed — a newer one typed
      // mid-flight stays pending and flushes below.
      if (entry.pending === pending) entry.pending = null;
      entry.retryAttempts = 0;
    } catch {
      // Keep the draft: `pending` is left in place so the next flush (auto
      // retry, next keystroke, next blur, next visit) resends the same
      // task-bound edit instead of losing it with the component.
      entry.retryAttempts += 1;
      if (entry.retryAttempts <= MAX_AUTO_RETRIES) {
        entry.timer = setTimeout(() => {
          entry.timer = undefined;
          void this.#flush(taskId, updateTask);
        }, DEBOUNCE_MS);
      }
    } finally {
      if (entry.inFlight === pending.editSequence) entry.inFlight = null;
      // A newer edit arrived while the save was in flight — the just-answered
      // sequence is stale, so fire the pending one right away rather than
      // leaving the title a revision behind. The same-edit check matters on
      // the failure path: re-flushing the edit that just failed would spin an
      // unbounded retry loop after the retry budget ran out.
      if (entry.pending && entry.pending !== pending && !entry.timer) {
        void this.#flush(taskId, updateTask);
      }
      if (!entry.pending && entry.inFlight === null && !entry.timer) {
        this.#entries.delete(taskId);
      }
      this.#notify();
    }
  };
}

export const taskTitleSaveQueue = new TaskTitleSaveQueue();
