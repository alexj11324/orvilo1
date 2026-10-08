'use client';

import React, { memo } from 'react';

import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceConversationFeed } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import { useAgentTopicGroupMode } from '../hooks/useAgentTopicGroupMode';
import ByProjectMode from './ByProjectMode';
import ByStatusMode from './ByStatusMode';
import ByTimeMode from './ByTimeMode';
import FlatMode from './FlatMode';
import SearchResult from './SearchResult';

const TopicListContent = memo(() => {
  const [isUndefinedTopics, isInSearchMode] = useChatStore((s) => [
    topicSelectors.isUndefinedTopics(s),
    topicSelectors.isInSearchMode(s),
  ]);

  const { topicGroupMode } = useAgentTopicGroupMode();

  useWorkspaceConversationFeed();

  if (isInSearchMode) return <SearchResult />;

  // Show skeleton when current session's topic data is not yet loaded
  if (isUndefinedTopics) return <SkeletonList />;

  return (
    <>
      {topicGroupMode === 'flat' ? (
        <FlatMode />
      ) : topicGroupMode === 'byProject' ? (
        <ByProjectMode />
      ) : topicGroupMode === 'byStatus' ? (
        <ByStatusMode />
      ) : (
        <ByTimeMode />
      )}
    </>
  );
});

TopicListContent.displayName = 'TopicListContent';

export default TopicListContent;
