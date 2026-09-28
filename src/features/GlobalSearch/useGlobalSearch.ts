import { useDebounce } from 'ahooks';
import { useMemo } from 'react';
import useSWR from 'swr';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { type GlobalSearchResult, globalSearchService } from '@/services/globalSearch';
import { globalHelpers } from '@/store/global/helpers';

import { groupSearchResults } from './groupSearchResults';
import type { GlobalSearchGroup } from './types';

export const GLOBAL_SEARCH_DEBOUNCE_MS = 300;

export interface UseGlobalSearchOptions {
  /** Scope FTS results to one agent (agent-page context). */
  agentId?: string;
  /** Disable fetching without unmounting (e.g. a closed surface). */
  enabled?: boolean;
  limitPerType?: number;
  query: string;
  /** Optional type filter — routed to the owning backend by `searchAll`. */
  type?: string;
}

export interface UseGlobalSearchResult {
  /** Fetch-level failure (FTS backend) — show an honest error state. */
  error: unknown;
  groups: GlobalSearchGroup[];
  /** The debounced, trimmed query actually being searched. */
  hasQuery: boolean;
  /** Query ran, nothing failed, zero results — show the empty state. */
  isEmpty: boolean;
  isLoading: boolean;
  isValidating: boolean;
  results: GlobalSearchResult[];
  trimmedQuery: string;
  /** Work sidecar failed; `results` may be partial — show a subtle notice. */
  workFailed: boolean;
}

/**
 * Debounced global search: query → `globalSearchService.searchAll` → grouped,
 * typed results with honest loading / error / empty state flags. Mount-agnostic —
 * the CommandMenu palette, a sidebar quick-search, or a standalone page can all
 * consume the same hook.
 */
export const useGlobalSearch = ({
  agentId,
  enabled = true,
  limitPerType,
  query,
  type,
}: UseGlobalSearchOptions): UseGlobalSearchResult => {
  const workspaceId = useActiveWorkspaceId();
  const debouncedQuery = useDebounce(query, { wait: GLOBAL_SEARCH_DEBOUNCE_MS });
  const trimmedQuery = debouncedQuery.trim();
  const hasQuery = trimmedQuery.length > 0;

  const { data, error, isLoading, isValidating } = useSWR(
    enabled && hasQuery
      ? ['global-search', trimmedQuery, type ?? null, agentId ?? null, workspaceId]
      : null,
    () =>
      globalSearchService.searchAll({
        agentId,
        limitPerType,
        locale: globalHelpers.getCurrentLanguage(),
        query: trimmedQuery,
        type,
        workspaceId,
      }),
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const results = useMemo<GlobalSearchResult[]>(() => data?.items ?? [], [data]);
  const groups = useMemo(() => groupSearchResults(results), [results]);

  return {
    error,
    groups,
    hasQuery,
    isEmpty: hasQuery && !isLoading && !error && results.length === 0,
    isLoading,
    isValidating,
    results,
    trimmedQuery,
    workFailed: Boolean(data?.workFailed),
  };
};
