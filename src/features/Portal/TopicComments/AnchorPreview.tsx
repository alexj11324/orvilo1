import { Tag, Text } from '@lobehub/ui/base-ui';
import type { TopicCommentItem } from '@orvilo/types';
import { cx } from 'antd-style';
import { MessageSquareText } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { displayMessageSelectors } from '@/store/chat/selectors';

import {
  highlightMessageWhenScrollSettles,
  isTopicCommentAnchorDeleted,
  resolveTopicCommentMessageLocation,
} from './messageLocator';
import { styles } from './styles';

const AnchorPreview = memo<{ comment: TopicCommentItem }>(({ comment }) => {
  const { t } = useTranslation('chat');
  const [messageIndex, messageElementId, scrollToIndex] = useChatStore((s) => {
    if (!s.activeAgentId || s.activeTopicId !== comment.topicId)
      return [-1, undefined, s.mainConversationScrollToIndex] as const;

    const location = resolveTopicCommentMessageLocation(
      displayMessageSelectors.mainDisplayChats(s),
      comment.messageId,
    );

    return [location?.index ?? -1, location?.elementId, s.mainConversationScrollToIndex] as const;
  });
  const canLocateMessage = messageIndex >= 0;
  const isDeleted = isTopicCommentAnchorDeleted(comment.messageId);

  const locateMessage = useCallback(() => {
    if (!messageElementId || !canLocateMessage || !scrollToIndex) return;
    requestAnimationFrame(() => {
      scrollToIndex(messageIndex, { align: 'center', smooth: true });
      highlightMessageWhenScrollSettles(messageElementId);
    });
  }, [canLocateMessage, messageElementId, messageIndex, scrollToIndex]);

  if (!comment.anchorPreview) return null;

  return (
    <div
      aria-disabled={canLocateMessage ? undefined : true}
      className={cx('flex flex-col gap-1', styles.anchor)}
      role={canLocateMessage ? 'button' : undefined}
      tabIndex={canLocateMessage ? 0 : undefined}
      onClick={locateMessage}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        locateMessage();
      }}
    >
      <div className="flex flex-row items-center gap-1.5">
        <span className="anticon" role="img">
          <MessageSquareText fill={'transparent'} height={14} size={14} width={14} />
        </span>
        <Text fontSize={12} weight={500}>
          {t('topicComment.anchor')}
        </Text>
        {isDeleted && <Tag size={'small'}>{t('topicComment.anchorDeletedTag')}</Tag>}
      </div>
      <Text ellipsis={{ rows: 2 }} fontSize={12} type={'secondary'}>
        {comment.anchorPreview.excerpt || t('topicComment.anchorEmpty')}
      </Text>
    </div>
  );
});

AnchorPreview.displayName = 'TopicCommentAnchorPreview';

export default AnchorPreview;
