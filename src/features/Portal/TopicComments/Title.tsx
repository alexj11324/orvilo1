import { MessageCircle } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

export const TopicCommentsTitle = memo(() => {
  const { t } = useTranslation('chat');
  const view = useChatStore(chatPortalSelectors.topicCommentsView);

  return (
    <div className="flex flex-row items-center gap-2">
      <span className="anticon" role="img">
        <MessageCircle fill={'transparent'} height={18} size={18} width={18} />
      </span>
      <div className="font-medium">
        {view?.messageId ? t('topicComment.messageComments') : t('topicComment.title')}
      </div>
    </div>
  );
});

export const TopicCommentThreadTitle = memo(() => {
  const { t } = useTranslation('chat');
  return <div className="font-medium">{t('topicComment.thread')}</div>;
});
