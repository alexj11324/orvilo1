import { type SWRHook } from 'swr';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';

import { augmentKey } from './augmentKey';
import { isAutoRetryable } from './normalizeError';

export { augmentKey };

const CLIENT_POLLING_SWR_DEDUPING_INTERVAL = 30_000;

/**
 * This type of request method is for relatively flexible data, which will be triggered on the first time.
 *
 * Refresh rules have two types:
 * - When the user refocuses, it will be refreshed outside the 5mins interval.
 * - Can be combined with refreshXXX methods to refresh data.
 *
 * Suitable for messages, topics, sessions, and other data that users will interact with on the client.
 */
// @ts-ignore
export const useClientDataSWR: SWRHook = (key, fetch, config) => {
  const workspaceId = useActiveWorkspaceId();
  return useSWR(augmentKey(key, workspaceId) as any, fetch, {
    // default is 2000ms ,it makes the user's quick switch don't work correctly.
    // Cause issue like this:
    // we need to set it to 0.
    dedupingInterval: 0,
    focusThrottleInterval: 5 * 60 * 1000,
    // Custom error retry logic: don't retry on 401 errors
    onErrorRetry: (error: any, ...args: any[]) => {
      const revalidate = args[2];
      const { retryCount } = args[3];

      // Auth walls, rate limits, and anything explicitly marked non-retryable:
      // an automatic backoff can't help and, for 429, actively hurts.
      if (!isAutoRetryable(error)) {
        return;
      }
      // For other errors, use default SWR retry behavior
      // Default: exponential backoff, max 5 retries
      if (retryCount >= 5) return;
      const exponentialDelay = 1000 * Math.pow(2, Math.min(retryCount, 10));
      const timeout = Math.min(exponentialDelay, 30_000);
      setTimeout(() => revalidate({ retryCount }), timeout);
    },
    refreshWhenOffline: false,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    ...config,
  });
};

/**
 * Polling-friendly variant of useClientDataSWR.
 *
 * Keeps the global zero-deduping behavior untouched for interactive data while
 * giving polling call sites a request-dedupe window. Call sites can tune the
 * interval based on whether they want to preserve every poll tick or collapse
 * repeated ticks into fewer network requests.
 */
// @ts-ignore
export const useClientPollingSWR: SWRHook = (key, fetch, config) =>
  useClientDataSWR(key, fetch, {
    dedupingInterval: CLIENT_POLLING_SWR_DEDUPING_INTERVAL,
    ...config,
  });

/**
 * This type of request method is a relatively "static" request mode, which will only be triggered on the first request.
 * Suitable for first time requests like `initUserState`.
 */
// @ts-ignore
export const useOnlyFetchOnceSWR: SWRHook = (key, fetch, config) =>
  useSWR(key, fetch, {
    refreshWhenOffline: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    ...config,
  });

/**
 * Leading segment stamped onto every `useActionSWR` key so cache-wide
 * broadcast revalidations (`mutate(() => true, { revalidate: true })`, e.g.
 * the scope-reload in `GlobalProvider/Query.tsx`) can skip them. Action
 * fetchers are mutations — replaying them would re-run creates server-side.
 */
const ACTION_SWR_KEY_PREFIX = 'action:';

/** Whether a raw SWR key belongs to a `useActionSWR` hook. */
export const isActionSWRKey = (key: unknown): boolean =>
  Array.isArray(key) && key[0] === ACTION_SWR_KEY_PREFIX;

/** Predicate matching every registered SWR key *except* action hooks — the
 * matcher cache-wide revalidation broadcasts should use. */
export const isDataSWRKey = (key: unknown): boolean => !isActionSWRKey(key);

/**
 * This type of request method is for action triggers. Must use mutate to trigger the request.
 * Benefits: built-in loading/error states, easy to handle loading/error UI interactions.
 * Components with the same SWR key will automatically share loading state (e.g., create agent button and the + button in header).
 * Very suitable for create operations.
 *
 * Uses fallbackData as empty object so SWR thinks initial data exists.
 * Combined with revalidateOnMount: false, this prevents auto-fetch on mount.
 *
 * Error retry is disabled: action fetchers are mutations (createSession,
 * openNewTopicOrSaveTopic, ...), and SWR's default `onErrorRetry` re-runs a
 * failed fetcher forever (~5s exponential backoff, no cap). For a
 * non-idempotent mutation each retry is another server-side insert — one
 * dropped response turns a single tap into a stream of duplicate rows.
 * Callers that genuinely want retry can still opt in via `config`.
 */
// @ts-ignore
export const useActionSWR: SWRHook = (key, fetch, config) =>
  useSWR(key ? [ACTION_SWR_KEY_PREFIX, ...(Array.isArray(key) ? key : [key])] : key, fetch, {
    // Use empty object as fallback to prevent auto-fetch when cache is empty
    // Combined with revalidateOnMount: false, SWR won't call fetcher on mount
    fallbackData: {},
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    // If we disable `revalidateOnMount` but keep `revalidateIfStale` enabled (default true),
    // SWR can infer `isValidating=true` on subsequent renders while never actually starting a request.
    // This will lock action buttons in loading state.
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnMount: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    ...config,
  });

export interface SWRRefreshParams<T, A = (...args: any[]) => any> {
  action: A;
  optimisticData?: (data: T | undefined) => T;
}

export type SWRefreshMethod<T> = <A extends (...args: any[]) => Promise<any>>(
  params?: SWRRefreshParams<T, A>,
) => ReturnType<A>;

// Export hook with auto-sync functionality
export { useClientDataSWRWithSync } from './useClientDataSWRWithSync';

// Export scoped mutate (for custom cache provider scenarios)
export { mutate, setScopedMutate } from './mutate';
