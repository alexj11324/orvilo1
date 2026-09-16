'use client';

import { Flexbox } from '@lobehub/ui';
import isEqual from 'fast-deep-equal';
import { MoreHorizontal } from 'lucide-react';
import React, { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

import { useScrollActiveTopicIntoView } from '../../hooks/useScrollActiveTopicIntoView';
import TopicItem from '../../List/Item';

const FlatMode = memo(() => {
  const { t } = useTranslation('topic');
  const topicPageSize = useGlobalStore(systemStatusSelectors.topicPageSize);
  const topicSortBy = useUserStore(preferenceSelectors.topicSortBy);
  const topicIncludeCompleted = useUserStore(preferenceSelectors.topicIncludeCompleted);

  const [isExpandingPageSize, activeTopicId, hasMore, openAllTopicsDrawer] = useChatStore((s) => [
    topicSelectors.isExpandingPageSize(s),
    s.activeTopicId,
    topicSelectors.hasMoreTopicsForSidebar(s),
    s.openAllTopicsDrawer,
  ]);

  const activeTopicList = useChatStore(
    topicSelectors.displayTopicsForSidebar(topicPageSize, topicSortBy, topicIncludeCompleted),
    isEqual,
  );
  const renderedTopicIds = useMemo(
    () => activeTopicList?.map((topic) => topic.id).join(':') ?? '',
    [activeTopicList],
  );
  const listRef = useScrollActiveTopicIntoView(activeTopicId, renderedTopicIds);

  return (
    <Flexbox gap={1} ref={listRef}>
      {activeTopicList?.map((topic) => (
        <TopicItem
          fav={topic.favorite}
          id={topic.id}
          key={topic.id}
          metadata={topic.metadata}
          status={topic.status}
          title={topic.title}
          userId={topic.userId}
        />
      ))}
      {isExpandingPageSize && <SkeletonList rows={3} />}
      {hasMore && !isExpandingPageSize && (
        <NavItem icon={MoreHorizontal} title={t('loadMore')} onClick={openAllTopicsDrawer} />
      )}
    </Flexbox>
  );
});

FlatMode.displayName = 'FlatMode';

export default FlatMode;
