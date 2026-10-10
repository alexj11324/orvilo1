import { cn } from 'cn';
import { ArrowLeft } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import Body from './Body';
import ThreadBody from './ThreadBody';

const styles = {
  container: 'overflow-hidden flex-1 min-h-0',
  subheader: 'shrink-0 h-10 px-2 [border-block-end:1px_solid_var(--sidebar-border)]',
};

const TopicCommentsSidebar = memo(() => {
  const { t } = useTranslation('chat');
  const view = useChatStore(chatPortalSelectors.currentView);
  const [goBack, openTopicComments] = useChatStore((s) => [s.goBack, s.openTopicComments]);

  if (view?.type === PortalViewType.TopicComments && !view.messageId) {
    return <Body />;
  }

  if (
    view?.type !== PortalViewType.TopicComments &&
    view?.type !== PortalViewType.TopicCommentThread
  )
    return null;

  const isThread = view.type === PortalViewType.TopicCommentThread;

  return (
    <div className={cn('flex flex-col', styles.container)}>
      <div className={cn('flex flex-row items-center gap-1', styles.subheader)}>
        <ActionIcon
          aria-label={t('back', { ns: 'common' })}
          icon={ArrowLeft}
          size={DESKTOP_HEADER_ICON_SMALL_SIZE}
          onClick={isThread ? goBack : () => openTopicComments(view.topicId)}
        />
        <div className="text-[13px] font-medium">
          {t(isThread ? 'topicComment.thread' : 'topicComment.messageComments')}
        </div>
      </div>
      {isThread ? <ThreadBody /> : <Body />}
    </div>
  );
});

TopicCommentsSidebar.displayName = 'TopicCommentsSidebar';

export default TopicCommentsSidebar;
