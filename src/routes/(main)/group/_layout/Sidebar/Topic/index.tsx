'use client';

import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  accordionStyles,
  AccordionTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import React, { memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
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
          <AccordionHeader>
            <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
              <div className="flex items-center gap-1">
                <Text ellipsis fontSize={12} type={'secondary'} weight={500}>
                  {`${t('title')} ${topicCount > 0 ? topicCount : ''}`}
                </Text>
                {isRevalidating && <NeuralNetworkLoading size={14} />}
              </div>
            </AccordionTrigger>
            <div
              className={cx(
                'accordion-action',
                accordionStyles.action,
                accordionStyles.actionBorderless,
              )}
            >
              <div className="flex items-center gap-0.5">
                <Filter />
                <Actions />
              </div>
            </div>
          </AccordionHeader>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {renderSidebarMenuItems(dropdownMenu, [], 'context')}
        </ContextMenuContent>
      </ContextMenu>
      <AccordionPanel contentStyle={{ padding: 0 }}>
        <Suspense fallback={<SkeletonList />}>
          <div className="flex flex-col" style={{ gap: 1, paddingBlock: 1 }}>
            <List />
          </div>
        </Suspense>
      </AccordionPanel>
    </AccordionItem>
  );
});

export default Topic;
