import { MessageCircle } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import ActionIcon from '@/components/ActionIcon';
import { Badge } from '@/components/reui/badge';
import { DESKTOP_HEADER_ICON_SMALL_SIZE, MOBILE_HEADER_ICON_SIZE } from '@/const/layoutTokens';
import { useAgentContext } from '@/features/Conversation/useAgentContext';
import { useChatStore } from '@/store/chat';

import { usePrefetchTopicCommentsOnTopicLoad, useTopicCommentSummary } from './hooks';

const TopicCommentButton = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { t } = useTranslation('chat');
  const workspaceId = useActiveWorkspaceId();
  const { topicId } = useAgentContext();
  const openTopicComments = useChatStore((s) => s.openTopicComments);
  const { data } = useTopicCommentSummary(workspaceId ? topicId : undefined);
  usePrefetchTopicCommentsOnTopicLoad(workspaceId ? topicId : undefined);

  if (!workspaceId || !topicId) return null;

  return (
    <span style={{ display: 'inline-flex', position: 'relative' }}>
      <ActionIcon
        icon={MessageCircle}
        size={mobile ? MOBILE_HEADER_ICON_SIZE : DESKTOP_HEADER_ICON_SMALL_SIZE}
        title={t('topicComment.title')}
        tooltipProps={{ placement: 'bottom' }}
        onClick={() => openTopicComments(topicId)}
      />
      {data?.total ? (
        <Badge
          size="sm"
          style={{ pointerEvents: 'none', position: 'absolute', right: -3, top: -3 }}
          variant="destructive"
        >
          {data.total > 99 ? '99+' : data.total}
        </Badge>
      ) : null}
    </span>
  );
});

TopicCommentButton.displayName = 'TopicCommentButton';

export default TopicCommentButton;
