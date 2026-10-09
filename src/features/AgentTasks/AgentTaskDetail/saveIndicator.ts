import type { SaveStatus } from '@/types/saveState';

/** How long "Saved" stays on screen after a successful write. */
export const SAVED_VISIBLE_MS = 2000;

export type SaveIndicatorEvent =
  /** The store's save status for the task changed. */
  | { status: SaveStatus; type: 'status' }
  /** The "Saved" display window elapsed. */
  | { type: 'expire' };

/**
 * What the issue header shows for the store's save status: `saving` → `saved`
 * (hidden again after {@link SAVED_VISIBLE_MS}) → idle. `failed` is sticky —
 * only a new write (`saving`) or its success replaces it, never a timer.
 */
export const reduceSaveIndicator = (current: SaveStatus, event: SaveIndicatorEvent): SaveStatus => {
  if (event.type === 'status') return event.status;
  return current === 'saved' ? 'idle' : current;
};

/**
 * Initial indicator for a freshly mounted header. A `saved` left in the store
 * by an earlier visit is stale news, so only `saving` / `failed` carry over.
 */
export const initialSaveIndicator = (status: SaveStatus): SaveStatus =>
  status === 'saved' ? 'idle' : status;
