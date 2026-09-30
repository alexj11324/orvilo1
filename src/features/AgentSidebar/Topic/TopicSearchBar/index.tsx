'use client';

import { useUnmount } from 'ahooks';
import { SearchIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { useChatStore } from '@/store/chat';

const TopicSearchBar = memo<{ onClear?: () => void }>(({ onClear }) => {
  const { t } = useTranslation('topic');

  const [tempValue, setTempValue] = useState('');
  const [searchKeyword, setSearchKeywords] = useState('');
  const [activeAgentId, useSearchTopics] = useChatStore((s) => [
    s.activeAgentId,
    s.useSearchTopics,
  ]);

  useSearchTopics(searchKeyword, { agentId: activeAgentId });

  useUnmount(() => {
    useChatStore.setState({ inSearchingMode: false, isSearchingTopic: false });
  });

  const startSearchTopic = () => {
    if (tempValue === searchKeyword) return;

    setSearchKeywords(tempValue);
    useChatStore.setState({ inSearchingMode: !!tempValue, isSearchingTopic: !!tempValue });
  };

  return (
    <div className="relative">
      <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        autoFocus
        className="pl-8"
        placeholder={t('searchPlaceholder')}
        value={tempValue}
        onBlur={() => {
          if (tempValue === '') {
            onClear?.();

            return;
          }

          startSearchTopic();
        }}
        onChange={(e) => {
          setTempValue(e.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') startSearchTopic();
        }}
      />
    </div>
  );
});

export default TopicSearchBar;
