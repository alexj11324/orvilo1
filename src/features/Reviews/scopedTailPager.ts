import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useSingleton } from '@/hooks/useSingleton';

export interface ScopedTail<T> {
  hasMore: boolean;
  items: T[];
  nextCursor: string | null;
}

interface ScopedToken {
  generation: number;
  scope: string;
}

/**
 * Cursor-paginated tail bound to a request identity — the same scope +
 * generation discipline as `InboxFeedPager`, shaped for any `{items,
 * hasMore, nextCursor}` page.
 *
 * The first page is owned by SWR; every later page lives here. Each
 * `loadMore` captures `{scope, generation}` before it awaits: switching tab,
 * workspace or query fingerprint bumps the generation through `setScope`, so
 * a late response resolves into a dropped write — it can neither append
 * rows, record an error, nor clear the pending flag a *new* request set.
 * Clearing state never cancels the in-flight promise; the guard lives at
 * write-back.
 *
 * `key` namespaces concurrent loads inside one pager (e.g. one key per
 * group), giving each its own pending flag and error slot.
 */
export class ScopedTailPager<T> {
  #errors = new Map<string, unknown>();
  #generation = 0;
  #loadingKeys = new Set<string>();
  #scope = '';
  #tail: ScopedTail<T> | null = null;
  #version = 0;
  #listeners = new Set<() => void>();

  constructor(
    /** Merge an incoming page into the loaded tail — the seam dedupe policy. */
    private readonly mergeItems: (tail: T[], page: T[]) => T[],
  ) {}

  /** Monotonic snapshot for `useSyncExternalStore` — bumps on every write. */
  get version(): number {
    return this.#version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #emit = () => {
    this.#version += 1;
    for (const listener of this.#listeners) listener();
  };

  /** Error recorded by the page fetch bound to `key`, if any. */
  errorFor = (key: string): unknown => this.#errors.get(key);

  isLoading = (key: string): boolean => this.#loadingKeys.has(key);

  /** True while any keyed page request is on the wire. */
  get loading(): boolean {
    return this.#loadingKeys.size > 0;
  }

  /**
   * Rebind the pager to a new request identity. Bumps the generation so any
   * in-flight page fetch from the previous identity can never commit — the
   * stale tail, its errors and its pending flags die in the same turn.
   */
  setScope = (scope: string): void => {
    if (scope === this.#scope) return;
    this.#scope = scope;
    this.#generation += 1;
    this.#tail = null;
    this.#errors.clear();
    this.#loadingKeys.clear();
    this.#emit();
  };

  /**
   * The tail only exists while its scope is current — a caller always reads
   * through `tailFor(currentScope)` so a not-yet-reset stale tail stays
   * hidden even before the scope-change effect runs.
   */
  tailFor = (scope: string): ScopedTail<T> | null => (scope === this.#scope ? this.#tail : null);

  #isCurrent = (token: ScopedToken): boolean =>
    token.scope === this.#scope && token.generation === this.#generation;

  /**
   * Fetch one more page under `key`. The response commits only when the
   * captured identity is still current — a stale promise's resolve cannot
   * resurrect the old query's rows and its reject cannot echo the old
   * query's error under the new one. `finally` only releases the pending
   * flag for a still-current token, so an old request never clears the new
   * request's loading state.
   */
  loadMore = async (
    scope: string,
    key: string,
    fetchPage: () => Promise<ScopedTail<T>>,
  ): Promise<void> => {
    if (this.#loadingKeys.has(key)) return;
    const token: ScopedToken = { generation: this.#generation, scope };
    this.#loadingKeys.add(key);
    this.#errors.delete(key);
    this.#emit();
    try {
      const page = await fetchPage();
      if (!this.#isCurrent(token)) return;
      this.#tail = {
        hasMore: page.hasMore,
        items: this.mergeItems(this.#tail?.items ?? [], page.items),
        nextCursor: page.nextCursor,
      };
    } catch (error) {
      if (!this.#isCurrent(token)) return;
      // The failed page is not persisted — the cursor stays put so a retry
      // re-issues the same page instead of skipping rows.
      this.#errors.set(key, error);
    } finally {
      if (this.#isCurrent(token)) {
        this.#loadingKeys.delete(key);
      }
      this.#emit();
    }
  };

  /**
   * Forget every loaded tail page and bump the generation — used by refresh
   * so a refetch never reuses a stale cursor and an in-flight `loadMore`
   * resolves into a dropped write.
   */
  reset = (): void => {
    this.#generation += 1;
    this.#tail = null;
    this.#errors.clear();
    this.#loadingKeys.clear();
    this.#emit();
  };
}

/**
 * React binding: one pager per mounted page; `useSyncExternalStore`
 * re-renders on every committed tail write. `setScope` rebinds on identity
 * change, so the tail read through `tailFor` is always the current query's.
 */
export const useScopedTailPager = <T>(
  scope: string,
  mergeItems: (tail: T[], page: T[]) => T[],
): ScopedTailPager<T> => {
  const pager = useSingleton(() => new ScopedTailPager<T>(mergeItems));
  useSyncExternalStore(
    useCallback((onStoreChange) => pager.subscribe(onStoreChange), [pager]),
    useCallback(() => pager.version, [pager]),
  );
  useEffect(() => {
    pager.setScope(scope);
  }, [pager, scope]);
  return pager;
};
