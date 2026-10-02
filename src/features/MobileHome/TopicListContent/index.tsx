'use client';

import { memo } from 'react';

import { useFetchAgentList } from '@/hooks/useFetchAgentList';
import { useFetchSessions } from '@/hooks/useFetchSessions';
import { useSessionStore } from '@/store/session';

import SearchMode from './SearchMode';
import TopicList from './TopicList';

/**
 * 会话 tab content: a cross-agent conversation list. Agent management that
 * used to live here (model badges, group accordions, ⋯ menus) moved to
 * 我 → Settings → Agents — navigation surfaces show agent names, never models.
 */
const TopicListContent = memo(() => {
  const isSearching = useSessionStore((s) => s.isSearching);

  // Agent names/avatars resolve from the agent store first and the eagerly
  // loaded home agent list second — keep both warm so secondary metadata
  // doesn't degrade to the untitled fallback.
  useFetchSessions();
  useFetchAgentList();

  return isSearching ? <SearchMode /> : <TopicList />;
});

TopicListContent.displayName = 'MobileTopicListContent';

export default TopicListContent;
