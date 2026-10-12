import { MessageCircle } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useChatStore } from '@/store/chat';

const styles = {
  button:
    'gap-1 rounded-(--radius-button) px-1.5 text-xs leading-5 text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent active:text-foreground has-data-[icon=inline-start]:pl-1.5 has-data-[icon=inline-end]:pr-1.5',
  container: 'flex flex-none items-center rounded-(--radius-button) bg-secondary',
};

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
    <div className={styles.container}>
      <Button
        aria-label={label}
        className={styles.button}
        size="compact"
        title={label}
        variant="ghost"
        onClick={() => openTopicComments(topicId, messageId)}
      >
        <MessageCircle className="size-4" data-icon="inline-start" size={16} />
        {count > 99 ? '99+' : count}
      </Button>
    </div>
  );
});

MessageCommentBadge.displayName = 'MessageCommentBadge';

export default MessageCommentBadge;
