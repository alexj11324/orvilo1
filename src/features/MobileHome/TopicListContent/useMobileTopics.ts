import { useCallback, useMemo } from 'react';
import useSWRInfinite from 'swr/infinite';

import { useClientDataSWR } from '@/libs/swr';
import { topicKeys } from '@/libs/swr/keys';
import { type TopicListPage, topicService } from '@/services/topic';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import {
  flattenTopicPages,
  MOBILE_TOPIC_STATUSES,
  type MobileTopicRow,
  toMobileTopicRows,
} from './mobileTopicRows';

const PAGE_SIZE = 30;

type MobileTopicListKey = readonly ['topic:list', string, Record<string, unknown>];

const fetchMobileTopicPage = ([, , opts]: MobileTopicListKey) =>
  topicService.queryTopicsPage({
    cursor: opts.cursor as string | undefined,
    limit: PAGE_SIZE,
    statuses: opts.statuses as string[],
    withLastMessage: true,
  });

/**
 * Workspace-wide conversation feed for the mobile 会话 tab — the same
 * `queryTopics` source the home inbox uses, minus the status narrowing, so
 * every non-archived conversation shows up regardless of which agent owns it.
 * Pages through the cursor contract (`useSWRInfinite` + `nextCursor`) so a
 * long history lazy-loads on scroll instead of one unbounded fetch.
 */
export const useMobileTopics = () => {
  const isLogin = useUserStore(authSelectors.isLogin);

  const getKey = useCallback(
    (_index: number, previous: TopicListPage | null): MobileTopicListKey | null => {
      if (!isLogin || previous?.nextCursor === null) return null;
      return topicKeys.list('mobile-home', {
        cursor: previous?.nextCursor,
        statuses: MOBILE_TOPIC_STATUSES,
      }) as MobileTopicListKey;
    },
    [isLogin],
  );

  const { data, error, isLoading, mutate, setSize, size } = useSWRInfinite<TopicListPage>(
    getKey,
    fetchMobileTopicPage,
    {
      // Rows carry live statuses (running / unread), so refetch promptly on focus.
      focusThrottleInterval: 1000,
      revalidateFirstPage: false,
      revalidateOnMount: true,
    },
  );

  const topics: MobileTopicRow[] = useMemo(
    () => toMobileTopicRows(flattenTopicPages(data ?? [])),
    [data],
  );

  const lastPage = data?.findLast(Boolean);
  const hasLoadedPages = data !== undefined;
  const isLoadingMore = !error && hasLoadedPages && size > 0 && data?.[size - 1] === undefined;

  return {
    // Only a first-load failure is a hard error; a background poll error keeps
    // the stale list rather than blanking the screen.
    error: error !== undefined && !hasLoadedPages ? error : undefined,
    hasMore: !error && (lastPage ? lastPage.nextCursor !== null : false),
    isInit: !isLoading || hasLoadedPages,
    isLoadingMore,
    loadMore: () => setSize((current) => current + 1),
    reload: mutate,
    topics,
  };
};

/**
 * The agent a "new conversation" should open on. Reads the persisted
 * `systemStatus.lastUsedAgentId`, which only explicit actions move (composer
 * pick / send / handoff) — a background run bumping a topic's `updatedAt`
 * must never change it, so it is deliberately not derived from `topics[0]`.
 */
export const useLastUsedAgentId = (): string | undefined =>
  useGlobalStore(systemStatusSelectors.lastUsedAgentId);

/** Cross-agent topic search — the search bar and the list share one SWR key. */
export const useSearchTopics = (keywords?: string) => {
  const isLogin = useUserStore(authSelectors.isLogin);

  const { data, isLoading, isValidating } = useClientDataSWR(
    isLogin && keywords ? topicKeys.search(keywords) : null,
    () => topicService.searchTopics(keywords!),
  );

  const topics: MobileTopicRow[] = useMemo(() => toMobileTopicRows(data ?? []), [data]);

  return { isLoading, isValidating, topics };
};
