import { Flexbox } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentContext } from '@/features/Conversation/useAgentContext';
import { useFetchActiveTopicDetail } from '@/hooks/useFetchActiveTopicDetail';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useSessionStore } from '@/store/session';
import { sessionSelectors } from '@/store/session/selectors';

import ChatHistoryTitleMenu from '../../ChatHistory/TitleMenu';
import MemberCountTag from './MemberCountTag';
import ThreadSwitcher from './ThreadSwitcher';

const TitleTags = memo(() => {
  const { t } = useTranslation(['topic', 'chat']);
  const { threadId, topicId } = useAgentContext();
  const threadTitle = useChatStore((s) =>
    threadId && topicId
      ? s.threadMaps[topicId]?.find((thread) => thread.id === threadId)?.title
      : undefined,
  );
  const topicTitle = useChatStore((s) =>
    topicId ? topicSelectors.getTopicById(topicId)(s)?.title : undefined,
  );
  const isGroupSession = useSessionStore(sessionSelectors.isCurrentSessionGroupSession);

  // Archived topics fall out of the sidebar list fetch — pull their detail by
  // id so the title doesn't degrade to the "new topic" placeholder.
  useFetchActiveTopicDetail();

  if (isGroupSession) {
    return (
      <Flexbox allowShrink horizontal align={'center'} gap={12} style={{ minWidth: 0 }}>
        <MemberCountTag />
      </Flexbox>
    );
  }

  const fallbackTopicTitle = topicTitle || t('newTopic');
  const fallbackThreadTitle = threadTitle || t('thread.title', { ns: 'chat' });

  return (
    <Flexbox allowShrink horizontal align={'center'} gap={6} style={{ marginLeft: 8, minWidth: 0 }}>
      {threadId ? (
        <>
          {/* The topic crumb keeps the reference's title-trigger behavior:
              it opens the same chat-history menu as the bare title state. */}
          <ChatHistoryTitleMenu title={fallbackTopicTitle} />
          <span
            style={{
              color: cssVar.colorTextQuaternary,
              flexShrink: 0,
              fontSize: 14,
            }}
          >
            {'/'}
          </span>
          <ThreadSwitcher title={fallbackThreadTitle} />
        </>
      ) : (
        <ChatHistoryTitleMenu title={fallbackTopicTitle} />
      )}
    </Flexbox>
  );
});

export default TitleTags;
