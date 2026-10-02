import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import SimpleEmpty from '@/components/SimpleEmpty';
import { useSessionStore } from '@/store/session';

import SkeletonList from '../SkeletonList';
import TopicRow from './TopicRow';
import { useSearchTopics } from './useMobileTopics';

/**
 * Search mode on the 会话 tab searches *conversations*, not agents — the
 * directory search it replaced surfaced identical-looking agent cards.
 */
const SearchMode = memo(() => {
  const { t } = useTranslation('chat');
  const keywords = useSessionStore((s) => s.sessionSearchKeywords?.trim());

  const { isLoading, topics } = useSearchTopics(keywords);

  if (isLoading) return <SkeletonList />;
  if (topics.length === 0) return <SimpleEmpty description={t('chatHistory.empty')} />;

  return (
    <div className="flex flex-col">
      {topics.map((topic) => (
        <TopicRow key={topic.id} topic={topic} />
      ))}
    </div>
  );
});

SearchMode.displayName = 'MobileTopicSearchMode';

export default SearchMode;
