import { useCallback, useEffect, useRef, useState } from 'react';

import { type SaveStatus } from '@/types/saveState';

export interface SaveStateHandle {
  /** Timestamp of the last successful save, for `AutoSaveHint`'s "Saved {fromNow}". */
  lastSavedAt: Date | null;
  /** Re-run the most recent save task — wire to the Retry affordance of a failed hint. */
  retry: () => Promise<void>;
  /** Run a save task, driving `status` through saving → saved / failed. */
  save: (task: () => Promise<void>) => Promise<void>;
  status: SaveStatus;
}

export interface SaveStateOptions {
  /** Only the latest request may report status/time; dispose pending UI work on unmount. */
  latestRequestOnly?: boolean;
}

/**
 * Component-level save-state primitive for surfaces that own their autosave
 * locally (no store save-status map). Pair with `AutoSaveHint`:
 *
 * ```tsx
 * const { status, lastSavedAt, save, retry } = useSaveState();
 * // in the debounced change handler: save(() => service.update(id, value))
 * <AutoSaveHint saveStatus={status} lastUpdatedTime={lastSavedAt} onRetry={retry} />
 * ```
 *
 * The whole point: a failed save resolves to `failed`,
 * never `idle`, so it can't render as a clean "Latest version loaded". Errors
 * are swallowed after being surfaced via `status` so fire-and-forget autosave
 * callers don't produce unhandled rejections; use the store-level `runMutation`
 * when a caller needs the error to propagate (e.g. keep a modal open).
 */
export const useSaveState = ({
  latestRequestOnly = false,
}: SaveStateOptions = {}): SaveStateHandle => {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Keep the latest save task so `retry` re-runs exactly what failed.
  const lastTaskRef = useRef<(() => Promise<void>) | null>(null);
  const requestRef = useRef(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  const save = useCallback(
    async (task: () => Promise<void>) => {
      if (latestRequestOnly && !activeRef.current) return;
      const request = ++requestRef.current;
      const canReport = () =>
        !latestRequestOnly || (activeRef.current && requestRef.current === request);
      lastTaskRef.current = task;
      setStatus('saving');
      try {
        await task();
        if (canReport()) {
          setStatus('saved');
          setLastSavedAt(new Date());
        }
      } catch (error) {
        // Never collapse to `idle` on failure — that is the exact bug this
        // primitive exists to kill (a lost edit masquerading as "Latest").
        if (canReport()) setStatus('failed');
        console.error('[useSaveState] save failed:', error);
      }
    },
    [latestRequestOnly],
  );

  const retry = useCallback(async () => {
    const task = lastTaskRef.current;
    if (task) await save(task);
  }, [save]);

  return { lastSavedAt, retry, save, status };
};
