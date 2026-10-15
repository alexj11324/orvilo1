/** Focus only the exact mounted writable conversation/editor identity. A
 * request tries immediately; the timer only expires a not-yet-mounted target. */
export interface ComposerFocusOwner {
  focus: () => void;
  isCurrent: () => boolean;
}
const owners = new Map<string, Set<ComposerFocusOwner>>();
const listeners = new Set<() => void>();
const invalidators = new Map<string, Set<() => void>>();
export const COMPOSER_FOCUS_REQUEST_TTL_MS = 5000;
const notify = () => {
  for (const listener of listeners) listener();
};
export function registerComposerFocus(contextKey: string, owner: ComposerFocusOwner): () => void {
  const entries = owners.get(contextKey) ?? new Set<ComposerFocusOwner>();
  entries.add(owner);
  owners.set(contextKey, entries);
  notify();
  return () => {
    entries.delete(owner);
    if (!entries.size && owners.get(contextKey) === entries) {
      owners.delete(contextKey);
      for (const invalidate of invalidators.get(contextKey) ?? []) invalidate();
    }
    notify();
  };
}
export function requestComposerFocus(contextKey: string, onSettled?: () => void): () => void {
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    listeners.delete(attempt);
    const requests = invalidators.get(contextKey);
    requests?.delete(invalidate);
    if (requests?.size === 0) invalidators.delete(contextKey);
    if (timer !== undefined) clearTimeout(timer);
  };
  const invalidate = () => {
    cancel();
    onSettled?.();
  };
  function attempt() {
    if (cancelled) return;
    const current = [...(owners.get(contextKey) ?? [])].filter((owner) => owner.isCurrent());
    // Never pick a random composer when multiple live owners claim one context.
    if (current.length !== 1) return;
    cancel();
    try {
      current[0].focus();
    } catch (error) {
      console.error('[ComposerFocus] Registered editor focus failed', error);
    }
    onSettled?.();
  }
  listeners.add(attempt);
  const requests = invalidators.get(contextKey) ?? new Set<() => void>();
  requests.add(invalidate);
  invalidators.set(contextKey, requests);
  const timer = setTimeout(invalidate, COMPOSER_FOCUS_REQUEST_TTL_MS);
  attempt();
  return cancel;
}
