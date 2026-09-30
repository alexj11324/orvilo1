import { ActionIcon, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { ArrowLeft } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { DESKTOP_HEADER_ICON_SMALL_SIZE } from '@/const/layoutTokens';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { PortalViewType } from '@/store/chat/slices/portal/initialState';

import Body from './Body';
import ThreadBody from './ThreadBody';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    flex: 1;
    min-height: 0;
  `,
  subheader: css`
    flex-shrink: 0;
    height: 40px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

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
    <div className={cx('flex flex-col', styles.container)}>
      <div className={cx('flex flex-row items-center gap-1', styles.subheader)}>
        <ActionIcon
          icon={ArrowLeft}
          size={DESKTOP_HEADER_ICON_SMALL_SIZE}
          onClick={isThread ? goBack : () => openTopicComments(view.topicId)}
        />
        <Text fontSize={13} weight={500}>
          {t(isThread ? 'topicComment.thread' : 'topicComment.messageComments')}
        </Text>
      </div>
      {isThread ? <ThreadBody /> : <Body />}
    </div>
  );
});

TopicCommentsSidebar.displayName = 'TopicCommentsSidebar';

export default TopicCommentsSidebar;
