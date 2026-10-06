'use client';

import React, { memo } from 'react';

import { useDeferredMount } from '@/hooks/useDeferredMount';
import { useFetchActiveTopicDetail } from '@/hooks/useFetchActiveTopicDetail';
import { useWorkspaceConversationFeed } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import AllTopicsDrawer from '../AllTopicsDrawer';
import { useAgentTopicGroupMode } from '../hooks/useAgentTopicGroupMode';
import ByProjectMode from '../TopicListContent/ByProjectMode';
import ByStatusMode from '../TopicListContent/ByStatusMode';
import ByTimeMode from '../TopicListContent/ByTimeMode';
import FlatMode from '../TopicListContent/FlatMode';
import TopicListSkeleton from './TopicListSkeleton';

const TopicList = memo(() => {
  const isUndefinedTopics = useChatStore((s) => topicSelectors.isUndefinedTopics(s));

  const [allTopicsDrawerOpen, closeAllTopicsDrawer] = useChatStore((s) => [
    s.allTopicsDrawerOpen,
    s.closeAllTopicsDrawer,
  ]);

  const { topicGroupMode } = useAgentTopicGroupMode();

  useWorkspaceConversationFeed();
  useFetchActiveTopicDetail();

  // Route transitions must paint instantly: the mount commit shows a skeleton
  // frame and the real list renders in a deferred (interruptible) follow-up
  // pass, off the navigation's critical path.
  const listReady = useDeferredMount();

  // Show skeleton when current session's topic data is not yet loaded
  if (isUndefinedTopics || !listReady) return <TopicListSkeleton />;

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
      <AllTopicsDrawer open={allTopicsDrawerOpen} onClose={closeAllTopicsDrawer} />
    </>
  );
});

export default TopicList;
