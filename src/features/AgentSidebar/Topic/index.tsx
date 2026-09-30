'use client';

import React, { memo, Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import SidebarContextMenu from '@/features/NavPanel/components/SidebarContextMenu';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useFetchChatTopics } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import Actions from './Actions';
import Filter from './Filter';
import List from './List';
import ToggleGroups from './ToggleGroups';
import { useTopicActionsDropdownMenu } from './useDropdownMenu';

interface TopicProps {
  expanded: boolean;
  itemKey: string;
}

const Topic = memo<TopicProps>(({ expanded, itemKey }) => {
  const { t } = useTranslation(['topic', 'common']);
  const topicCount = useChatStore((s) => topicSelectors.currentTopicCount(s));
  const cleanupStaleRunningTopics = useChatStore((s) => s.cleanupStaleRunningTopics);
  const dropdownMenu = useTopicActionsDropdownMenu();
  const { isRevalidating } = useFetchChatTopics();
  const hasRunWatchdogRef = useRef(false);

  useEffect(() => {
    if (!expanded || hasRunWatchdogRef.current) return;

    hasRunWatchdogRef.current = true;
    void cleanupStaleRunningTopics();
  }, [cleanupStaleRunningTopics, expanded]);

  return (
    <AccordionItem value={itemKey}>
      <SidebarContextMenu items={dropdownMenu}>
        <div className="flex items-center">
          <div className="min-w-0 flex-1">
            <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
              <div className="flex items-center gap-1">
                <div className="truncate text-[12px] text-muted-foreground font-medium">
                  {t('sidebar.title')}
                </div>
                {topicCount > 0 && (
                  <div className="text-[11px] text-muted-foreground">{topicCount}</div>
                )}
                {isRevalidating && <NeuralNetworkLoading size={14} />}
              </div>
            </AccordionTrigger>
          </div>
          <div className="flex shrink-0 items-center">
            <div className="flex items-center gap-0.5">
              <ToggleGroups />
              <Filter />
              <Actions />
            </div>
          </div>
        </div>
      </SidebarContextMenu>
      <AccordionContent className="[&>div]:p-0">
        <Suspense fallback={<SkeletonList />}>
          <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
            <List />
          </div>
        </Suspense>
      </AccordionContent>
    </AccordionItem>
  );
});

export default Topic;
