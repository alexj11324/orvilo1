'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { CheckIcon, SearchIcon } from 'lucide-react';
import { type KeyboardEvent, memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { shallow } from 'zustand/shallow';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTopicNavigation } from '@/features/AgentSidebar/Topic/hooks/useTopicNavigation';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { useWorkspaceConversationFeed } from '@/hooks/useFetchChatTopics';
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
  item: css`
    cursor: pointer;

    overflow: hidden;
    flex: none;
    justify-content: space-between;

    width: 100%;
    min-height: 32px;
    padding-block: 4px;
    padding-inline: 8px;
    border: none;
    border-radius: 6px;

    font-family: inherit;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
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

    &[aria-current='true'],
    &[aria-current='true']:hover {
      font-weight: 600;
      background: var(--muted);
    }
  `,
  // Mirrors Linear's 320px `Chat history` menu: a search field on top of the
  // existing-chat rows for the agent currently in view.
  root: css`
    width: 100%;
    min-height: 0;
    max-height: min(400px, var(--available-height, 400px));
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
  const listRef = useRef<HTMLDivElement>(null);

  const [activeAgentId, activeTopicId] = useChatStore(
    (s) => [s.activeAgentId, s.activeTopicId],
    shallow,
  );

  // Keep the menu's rows on the same canonical fetch as the sidebar — the SWR
  // key dedupes against it, so this only covers the sidebar-collapsed case.
  useWorkspaceConversationFeed();

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

  const focusRow = (event: KeyboardEvent<HTMLElement>, fromSearch = false) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    if (fromSearch && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[data-topic-option]') ?? [],
    );
    if (!options.length) return;
    const index = options.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % options.length
            : (index - 1 + options.length) % options.length;
    event.preventDefault();
    options[fromSearch && event.key === 'ArrowUp' ? options.length - 1 : next]?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-1', styles.root)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <Input
          autoFocus
          aria-label={t('chatHistory.title', { ns: 'chat' })}
          className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          placeholder={t('chatHistory.title', { ns: 'chat' })}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(event) => focusRow(event, true)}
        />
      </div>
      <div
        className="flex flex-col gap-0.5 p-1"
        ref={listRef}
        style={{ maxHeight: 320, minHeight: 0, overflowY: 'auto' }}
        onKeyDown={focusRow}
      >
        {showLoading ? (
          <SkeletonList rows={3} />
        ) : rows && rows.length > 0 ? (
          rows.map((topic) => (
            <Button
              data-topic-option
              aria-current={topic.id === activeTopicId ? 'true' : undefined}
              className={styles.item}
              key={topic.id}
              title={topic.title}
              type={'button'}
              variant="ghost"
              onClick={() => {
                void navigateToTopic(topic.id);
                onNavigate?.();
              }}
            >
              <span className="min-w-0 truncate">{topic.title}</span>
              {topic.id === activeTopicId && <CheckIcon className="size-4 shrink-0" />}
            </Button>
          ))
        ) : (
          <div className={styles.empty}>
            {isSearching
              ? t('searchResultEmpty', { ns: 'topic' })
              : t('chatHistory.empty', { ns: 'chat' })}
          </div>
        )}
      </div>
    </div>
  );
});

ChatHistoryContent.displayName = 'ChatHistoryContent';

export default ChatHistoryContent;
