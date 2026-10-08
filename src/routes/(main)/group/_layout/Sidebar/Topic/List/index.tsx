'use client';

import React, { memo } from 'react';

import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useFetchActiveTopicDetail } from '@/hooks/useFetchActiveTopicDetail';
import { useFetchChatTopics } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

import AllTopicsDrawer from '../AllTopicsDrawer';
import ByTimeMode from '../TopicListContent/ByTimeMode';
import FlatMode from '../TopicListContent/FlatMode';

const TopicList = memo(() => {
  const isUndefinedTopics = useChatStore((s) => topicSelectors.isUndefinedTopics(s));
  const [allTopicsDrawerOpen, closeAllTopicsDrawer] = useChatStore((s) => [
    s.allTopicsDrawerOpen,
    s.closeAllTopicsDrawer,
  ]);

  const topicGroupMode = useUserStore(preferenceSelectors.topicGroupMode);

  useFetchChatTopics();
  useFetchActiveTopicDetail();

  // Show skeleton when current session's topic data is not yet loaded
  if (isUndefinedTopics) return <SkeletonList />;

  return (
    <>
      {topicGroupMode === 'flat' ? <FlatMode /> : <ByTimeMode />}
      <AllTopicsDrawer open={allTopicsDrawerOpen} onClose={closeAllTopicsDrawer} />
    </>
  );
});

export default TopicList;
