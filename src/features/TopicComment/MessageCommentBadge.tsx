import { createStaticStyles, cx } from 'antd-style';
import { MessageCircle } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';

const styles = createStaticStyles(({ css, cssVar }) => ({
  button: css`
    && {
      gap: 4px;
      padding-inline: 6px;
      border-radius: ${cssVar.borderRadiusXS};
      color: ${cssVar.colorTextTertiary};
    }

    &&:hover {
      color: ${cssVar.colorTextSecondary};
      background: ${cssVar.colorFillTertiary};
    }

    &&:active {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  container: css`
    border-radius: ${cssVar.borderRadius};
    background: ${cssVar.colorFillTertiary};
  `,
}));

interface MessageCommentBadgeProps {
  count: number;
  messageId: string;
  topicId: string;
}

const MessageCommentBadge = memo<MessageCommentBadgeProps>(({ count, messageId, topicId }) => {
  const { t } = useTranslation('chat');
  const openTopicComments = useChatStore((s) => s.openTopicComments);
  const label = t('topicComment.openMessageComments', { count });

  return (
    <div className={cx(styles.container, 'flex items-center flex-none p-[2px]')}>
      <Button
        aria-label={label}
        className={styles.button}
        size="sm"
        title={label}
        variant="ghost"
        onClick={() => openTopicComments(topicId, messageId)}
      >
        <MessageCircle data-icon="inline-start" />
        {count > 99 ? '99+' : count}
      </Button>
    </div>
  );
});

MessageCommentBadge.displayName = 'MessageCommentBadge';

export default MessageCommentBadge;
