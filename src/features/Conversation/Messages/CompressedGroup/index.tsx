'use client';

import { Markdown, ScrollShadow } from '@lobehub/ui';
import { ActionIcon, confirmModal, Tabs, type TabsItem } from '@lobehub/ui/base-ui';
import type { CompressionGroupMetadata, UIChatMessage } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { ChevronDown, ChevronUp, History, Sparkles, Undo2 } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import StreamingMarkdown from '@/components/StreamingMarkdown';
import { useChatStore } from '@/store/chat';
import { operationSelectors } from '@/store/chat/selectors';
import { shinyTextStyles } from '@/styles/loading';

import { dataSelectors, useConversationStore } from '../../store';
import CompressedMessageItem from './CompressedMessageItem';
import { isCompressionSummaryGenerating, shouldShowCompressedGroupPanel } from './logic';

const STORAGE_KEY_PREFIX = 'compressed-group-tab:';

const getStoredTab = (id: string): string => {
  if (typeof window === 'undefined') return 'summary';
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}${id}`) || 'summary';
};

const setStoredTab = (id: string, tab: string) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${id}`, tab);
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    margin-block-end: 8px;
    padding-block: 8px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
  `,
  contentScroll: css`
    max-height: min(40vh, 400px);
  `,
  header: css`
    .ant-tabs-nav {
      margin-block-end: 0;
    }
  `,
  messagesContainer: css`
    padding-block: 8px;
  `,
}));

export interface CompressedGroupMessageProps {
  id: string;
  index: number;
}

const CompressedGroupMessage = memo<CompressedGroupMessageProps>(({ id }) => {
  const { t } = useTranslation('chat');
  const [activeTab, setActiveTab] = useState<string>(() => getStoredTab(id));

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      setStoredTab(id, tab);
    },
    [id],
  );

  const message = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual);
  const toggleCompressedGroupExpanded = useConversationStore(
    (s) => s.toggleCompressedGroupExpanded,
  );
  const cancelCompression = useConversationStore((s) => s.cancelCompression);

  const handleCancelCompression = useCallback(() => {
    confirmModal({
      content: t('compression.cancelConfirm'),
      onOk: () => cancelCompression(id),
      title: t('compression.cancel'),
    });
  }, [id, cancelCompression, t]);

  const content = message?.content;
  const rawCompressedMessages = (message as UIChatMessage)?.compressedMessages;
  const expanded = (message?.metadata as CompressionGroupMetadata)?.expanded ?? true;

  // Filter out placeholder assistant message (content === '...' without tools)
  const compressedMessages = useMemo(() => {
    if (!rawCompressedMessages || rawCompressedMessages.length === 0) return rawCompressedMessages;

    const lastMsg = rawCompressedMessages.at(-1);
    const isPlaceholder =
      lastMsg &&
      (lastMsg.role === 'assistant' || lastMsg.role === 'assistantGroup') &&
      lastMsg.content === '...' &&
      (!lastMsg.tools || lastMsg.tools.length === 0) &&
      (!lastMsg.children || lastMsg.children.length === 0);

    return isPlaceholder ? rawCompressedMessages.slice(0, -1) : rawCompressedMessages;
  }, [rawCompressedMessages]);

  // Check if generateSummary operation is running for this message
  const runningOp = useChatStore(operationSelectors.getDeepestRunningOperationByMessage(id));
  const isGeneratingSummary = isCompressionSummaryGenerating(runningOp?.type);

  const showPanelContent = shouldShowCompressedGroupPanel({
    expanded,
    isGeneratingSummary,
  });

  const tabItems: TabsItem[] = useMemo(
    () => [
      {
        icon: <Sparkles size={14} />,
        key: 'summary',
        label: t('compression.summary'),
      },
      {
        icon: <History size={14} />,
        key: 'history',
        label: t('compression.history'),
      },
    ],
    [],
  );

  return (
    <div className={cn('flex flex-col gap-2', styles.container)}>
      {isGeneratingSummary ? (
        <>
          <div className="flex">
            {/*<FolderArchive size={14} />*/}
            <span className={cx(isGeneratingSummary ? shinyTextStyles.shinyText : '')}>
              {t('compressedHistory')}
            </span>
          </div>
          <StreamingMarkdown>{content}</StreamingMarkdown>
        </>
      ) : (
        <div className="flex items-center justify-between" style={{ width: '100%' }}>
          <Tabs
            activeKey={isGeneratingSummary ? 'summary' : activeTab}
            className={styles.header}
            items={tabItems}
            variant={'rounded'}
            onChange={handleTabChange}
          />
          <div className="flex gap-1">
            <ActionIcon
              icon={Undo2}
              size={'small'}
              title={t('compression.cancel')}
              onClick={handleCancelCompression}
            />
            <ActionIcon
              icon={expanded ? ChevronUp : ChevronDown}
              size={'small'}
              onClick={() => toggleCompressedGroupExpanded(id)}
            />
          </div>
        </div>
      )}
      {!showPanelContent ? null : activeTab === 'summary' ? (
        <ScrollShadow className={styles.contentScroll} offset={12} size={12}>
          <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
            {content}
          </Markdown>
        </ScrollShadow>
      ) : (
        <ScrollShadow className={styles.contentScroll} offset={12} size={12}>
          <div className={cn('flex flex-col gap-1', styles.messagesContainer)}>
            {compressedMessages?.map((msg) => (
              <CompressedMessageItem key={msg.id} message={msg} />
            ))}
          </div>
        </ScrollShadow>
      )}
    </div>
  );
});

CompressedGroupMessage.displayName = 'CompressedGroupMessage';

export default CompressedGroupMessage;
