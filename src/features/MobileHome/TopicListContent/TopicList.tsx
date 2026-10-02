import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import LazyLoad from 'react-lazy-load';

import AsyncError from '@/components/AsyncError';
import SimpleEmpty from '@/components/SimpleEmpty';

import SkeletonList from '../SkeletonList';
import TopicRow from './TopicRow';
import { useMobileTopics } from './useMobileTopics';

/**
 * The mobile 会话 tab body: a flat conversation list, most recently active
 * first. No disclosure groups, no pinned/custom agent-group sections — those
 * belonged to the retired agent-directory view and produced the broken
 * 「默认列表」 accordion.
 */
const TopicList = memo(() => {
  const { t } = useTranslation('chat');

  const { error, isInit, reload, topics } = useMobileTopics();

  if (!isInit) return <SkeletonList />;

  if (error) {
    return <AsyncError error={error} variant={'block'} onRetry={() => void reload()} />;
  }

  if (topics.length === 0) {
    return <SimpleEmpty description={t('chatHistory.empty')} />;
  }

  return (
    <div className="flex flex-col">
      {topics.map((topic) => (
        <LazyLoad key={topic.id}>
          <TopicRow topic={topic} />
        </LazyLoad>
      ))}
    </div>
  );
});

TopicList.displayName = 'MobileTopicList';

export default TopicList;
