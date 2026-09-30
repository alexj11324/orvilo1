'use client';

import { ContextMenuTrigger } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  accordionStyles,
  AccordionTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import { cx } from 'antd-style';
import React, { memo, Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
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
      <ContextMenuTrigger items={dropdownMenu}>
        <AccordionHeader>
          <AccordionTrigger style={{ paddingBlock: 4, paddingInline: '8px 4px' }}>
            <div className="flex items-center gap-1">
              <Text ellipsis fontSize={12} type={'secondary'} weight={500}>
                {t('sidebar.title')}
              </Text>
              {topicCount > 0 && (
                <Text fontSize={11} type="secondary">
                  {topicCount}
                </Text>
              )}
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
              <ToggleGroups />
              <Filter />
              <Actions />
            </div>
          </div>
        </AccordionHeader>
      </ContextMenuTrigger>
      <AccordionPanel contentStyle={{ padding: 0 }}>
        <Suspense fallback={<SkeletonList />}>
          <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1 }}>
            <List />
          </div>
        </Suspense>
      </AccordionPanel>
    </AccordionItem>
  );
});

export default Topic;
