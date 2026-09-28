'use client';

import { Flexbox, SearchBar } from '@lobehub/ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import isEqual from 'fast-deep-equal';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { shallow } from 'zustand/shallow';

import { useTopicNavigation } from '@/features/AgentSidebar/Topic/hooks/useTopicNavigation';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useFetchChatTopics } from '@/hooks/useFetchChatTopics';
import { topicService } from '@/services/topic';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { type ChatTopic } from '@/types/topic';

const styles = createStaticStyles(({ css }) => ({
  empty: css`
    padding-block: 24px;
    padding-inline: 12px;

    font-size: 12px;
    color: ${cssVar.colorTextDescription};
    text-align: center;
  `,
  // Native <button> rows: menu items must be keyboard-focusable and announce
  // as actions, not clickable divs.
  item: css`
    cursor: pointer;

    overflow: hidden;

    width: 100%;
    padding-block: 6px;
    padding-inline: 10px;
    border: none;
    border-radius: 6px;

    font-family: inherit;
    font-size: 13px;
    color: ${cssVar.colorText};
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;

    background: transparent;

    transition: background 0.15s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -1px;
    }
  `,
  itemActive: css`
    font-weight: 600;
    background: ${cssVar.colorFillSecondary};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  // Mirrors Linear's 320px `Chat history` menu: a search field on top of the
  // existing-chat rows for the agent currently in view.
  root: css`
    width: 320px;
  `,
}));

interface ChatHistoryContentProps {
  /** Called after a row navigates — popovers pass their close handler. */
  onNavigate?: () => void;
}

/**
 * Searchable chat-history rows shared by the header title trigger
 * (`Switch agent chat`) and the bottom-right `Chat history` control — same
 * topic data as the sidebar, two anchors like the reference.
 */
const ChatHistoryContent = memo<ChatHistoryContentProps>(({ onNavigate }) => {
  const { t } = useTranslation(['chat', 'topic']);
  const [keyword, setKeyword] = useState('');

  const [activeAgentId, activeTopicId] = useChatStore(
    (s) => [s.activeAgentId, s.activeTopicId],
    shallow,
  );

  // Keep the menu's rows on the same canonical fetch as the sidebar — the SWR
  // key dedupes against it, so this only covers the sidebar-collapsed case.
  useFetchChatTopics();

  const topics = useChatStore(topicSelectors.displayTopics, isEqual);
  const isTopicsLoading = useChatStore(topicSelectors.isUndefinedTopics);

  const trimmedKeyword = keyword.trim();
  const isSearching = trimmedKeyword.length > 0;
  // The drawer's `useSearchTopics` writes shared `searchTopics`/`isSearchingTopic`
  // state that the sidebar also reads. Query the service directly so this menu
  // can't trample a sidebar search running at the same time.
  const { data: searchResults, isLoading: isSearchLoading } = useSWR<ChatTopic[]>(
    isSearching && activeAgentId
      ? ['agent-chat-history-search', trimmedKeyword, activeAgentId]
      : null,
    ([, keywords, agentId]: [string, string, string]) =>
      topicService.searchTopics(keywords, agentId),
  );

  const { navigateToTopic } = useTopicNavigation();

  const rows = isSearching ? searchResults : topics;
  const showLoading = isSearching ? isSearchLoading && !searchResults : isTopicsLoading;

  return (
    <Flexbox className={styles.root} gap={4}>
      <Flexbox paddingBlock={'8px 0'} paddingInline={8}>
        <SearchBar
          allowClear
          autoFocus
          placeholder={t('chatHistory.title', { ns: 'chat' })}
          value={keyword}
          variant={'filled'}
          onInputChange={setKeyword}
        />
      </Flexbox>
      <Flexbox gap={2} padding={4} style={{ maxHeight: 320, minHeight: 0, overflowY: 'auto' }}>
        {showLoading ? (
          <SkeletonList rows={3} />
        ) : rows && rows.length > 0 ? (
          rows.map((topic) => (
            <button
              className={cx(styles.item, topic.id === activeTopicId && styles.itemActive)}
              key={topic.id}
              type={'button'}
              onClick={() => {
                void navigateToTopic(topic.id);
                onNavigate?.();
              }}
            >
              {topic.title}
            </button>
          ))
        ) : (
          <div className={styles.empty}>
            {isSearching
              ? t('searchResultEmpty', { ns: 'topic' })
              : t('chatHistory.empty', { ns: 'chat' })}
          </div>
        )}
      </Flexbox>
    </Flexbox>
  );
});

ChatHistoryContent.displayName = 'ChatHistoryContent';

export default ChatHistoryContent;
