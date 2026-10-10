import type { TopicCommentItem } from '@orvilo/types';
import { cn } from 'cn';
import { MessageSquareText } from 'lucide-react';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
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
      className={cn('flex flex-col gap-1', styles.anchor)}
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
        <div className="text-[12px] font-medium">{t('topicComment.anchor')}</div>
        {isDeleted && (
          <Badge size="sm" variant="secondary">
            {t('topicComment.anchorDeletedTag')}
          </Badge>
        )}
      </div>
      <div className="line-clamp-2 text-[12px] text-muted-foreground">
        {comment.anchorPreview.excerpt || t('topicComment.anchorEmpty')}
      </div>
    </div>
  );
});

AnchorPreview.displayName = 'TopicCommentAnchorPreview';

export default AnchorPreview;
