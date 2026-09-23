import { useCallback, useRef, useState } from 'react';

/**
 * Tail-page fetches (`loadMore` / per-group paging) are fire-and-forget from
 * list footers — a rejection must surface as an inline error with a retry
 * instead of dying as an unhandled rejection. `run` records the attempt so
 * the retry control re-issues exactly the request that failed (the flat tail
 * or one group's page); `reset` clears the slot on a query-scope change.
 */
export const usePagedLoadMore = () => {
  const [loadMoreError, setLoadMoreError] = useState<unknown>();
  const lastAttemptRef = useRef<(() => Promise<void>) | null>(null);

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

  const resetLoadMoreError = useCallback(() => {
    lastAttemptRef.current = null;
    setLoadMoreError(undefined);
  }, []);

  return { loadMoreError, resetLoadMoreError, retryLoadMore, runLoadMore };
};
