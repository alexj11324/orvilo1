'use client';

import React, { memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { renderSidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useFetchChatTopics } from '@/hooks/useFetchChatTopics';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';

import Actions from './Actions';
import Filter from './Filter';
import List from './List';
import { useTopicActionsDropdownMenu } from './useDropdownMenu';

interface TopicProps {
  itemKey: string;
}

const Topic = memo<TopicProps>(({ itemKey }) => {
  const { t } = useTranslation(['topic', 'common']);
  const [topicCount] = useChatStore((s) => [topicSelectors.currentTopicCount(s)]);
  const dropdownMenu = useTopicActionsDropdownMenu();
  const { isRevalidating } = useFetchChatTopics();

  return (
    <AccordionItem value={itemKey}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
                <div className="flex items-center gap-1">
                  <div className="truncate text-[12px] text-muted-foreground font-medium">
                    {`${t('title')} ${topicCount > 0 ? topicCount : ''}`}
                  </div>
                  {isRevalidating && <NeuralNetworkLoading size={14} />}
                </div>
              </AccordionTrigger>
            </div>
            <div className="flex shrink-0 items-center">
              <div className="flex items-center gap-0.5">
                <Filter />
                <Actions />
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {renderSidebarMenuItems(dropdownMenu, [], 'context')}
        </ContextMenuContent>
      </ContextMenu>
      <AccordionContent className="[&>div]:p-0">
        <Suspense fallback={<SkeletonList />}>
          <div className="flex flex-col" style={{ gap: 1, paddingBlock: 1 }}>
            <List />
          </div>
        </Suspense>
      </AccordionContent>
    </AccordionItem>
  );
});

export default Topic;
