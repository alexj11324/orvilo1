import { useCallback, useRef, useState } from 'react';

import { useSingleton } from '@/hooks/useSingleton';

/**
 * Tail-page fetches (`loadMore` / per-group paging) are fire-and-forget from
 * list footers — a rejection must surface as an inline error with a retry
 * instead of dying as an unhandled rejection. `run` records the attempt so
 * the retry control re-issues exactly the request that failed (the flat tail
 * or one group's page); `reset` clears the slot on a query-scope change.
 *
 * Two scopes:
 * - `runLoadMore` / `retryLoadMore` / `loadMoreError` — the flat tail page,
 *   one slot for the whole surface.
 * - `runLoadMoreGroup` / `retryLoadMoreGroup` / `loadMoreGroupErrors` — keyed
 *   by group key so a grouped list or kanban column surfaces the retry inside
 *   the group that failed, and one group's failure never steals another
 *   group's retry target.
 */
export const usePagedLoadMore = () => {
  const [loadMoreError, setLoadMoreError] = useState<unknown>();
  const lastAttemptRef = useRef<(() => Promise<void>) | null>(null);
  const [loadMoreGroupErrors, setLoadMoreGroupErrors] = useState<Record<string, unknown>>({});
  const groupAttempts = useSingleton(() => new Map<string, () => Promise<void>>());

  const runLoadMore = useCallback((attempt: () => Promise<void>) => {
    lastAttemptRef.current = attempt;
    setLoadMoreError(undefined);
    void attempt().catch((error: unknown) => {
      setLoadMoreError(error);
    });
  }, []);

  const retryLoadMore = useCallback(() => {
    const attempt = lastAttemptRef.current;
    if (!attempt) return;
    setLoadMoreError(undefined);
    void attempt().catch((error: unknown) => {
      setLoadMoreError(error);
    });
  }, []);

  const clearGroupError = useCallback((key: string) => {
    setLoadMoreGroupErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const runLoadMoreGroup = useCallback(
    (key: string, attempt: () => Promise<void>) => {
      groupAttempts.set(key, attempt);
      clearGroupError(key);
      void attempt().catch((error: unknown) => {
        setLoadMoreGroupErrors((current) => ({ ...current, [key]: error }));
      });
    },
    [clearGroupError],
  );

  const retryLoadMoreGroup = useCallback(
    (key: string) => {
      const attempt = groupAttempts.get(key);
      if (!attempt) return;
      clearGroupError(key);
      void attempt().catch((error: unknown) => {
        setLoadMoreGroupErrors((current) => ({ ...current, [key]: error }));
      });
    },
    [clearGroupError],
  );

  const resetLoadMoreError = useCallback(() => {
    lastAttemptRef.current = null;
    groupAttempts.clear();
    setLoadMoreError(undefined);
    setLoadMoreGroupErrors({});
  }, []);

  return {
    loadMoreError,
    loadMoreGroupErrors,
    resetLoadMoreError,
    retryLoadMore,
    retryLoadMoreGroup,
    runLoadMore,
    runLoadMoreGroup,
  };
};
