import { useMemo } from 'react';

import { useClientDataSWR } from '@/libs/swr';
import { topicKeys } from '@/libs/swr/keys';
import { topicService } from '@/services/topic';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { authSelectors } from '@/store/user/selectors';

import { MOBILE_TOPIC_STATUSES, type MobileTopicRow, toMobileTopicRows } from './mobileTopicRows';

/**
 * Workspace-wide conversation feed for the mobile 会话 tab — the same
 * `queryTopics` source the home inbox uses, minus the status narrowing, so
 * every non-archived conversation shows up regardless of which agent owns it.
 */
export const useMobileTopics = () => {
  const isLogin = useUserStore(authSelectors.isLogin);

  const { data, error, isLoading, mutate } = useClientDataSWR(
    isLogin ? topicKeys.list('mobile-home', { statuses: MOBILE_TOPIC_STATUSES }) : null,
    () => topicService.queryTopics({ statuses: MOBILE_TOPIC_STATUSES }),
    // Rows carry live statuses (running / unread), so refetch promptly on focus.
    { focusThrottleInterval: 1000 },
  );

  const topics: MobileTopicRow[] = useMemo(() => toMobileTopicRows(data ?? []), [data]);

  return {
    // Only a first-load failure is a hard error; a background poll error keeps
    // the stale list rather than blanking the screen.
    error: error !== undefined && data === undefined ? error : undefined,
    isInit: !isLoading,
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
