import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/slices/topic/selectors';

import { TAG_MARGIN_INLINE_END } from '../constants';

export interface ReferTopicViewProps {
  fallbackTitle?: string;
  topicId: string;
}

export const ReferTopicView = memo<ReferTopicViewProps>(({ topicId, fallbackTitle }) => {
  const { t } = useTranslation('topic');
  const title = useChatStore(topicSelectors.getTopicById(topicId))?.title || fallbackTitle;
  const switchTopic = useChatStore((s) => s.switchTopic);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (topicId) {
        switchTopic(topicId);
      }
    },
    [switchTopic, topicId],
  );

  return (
    <span
      style={{
        cursor: topicId ? 'pointer' : 'default',
        display: 'inline-flex',
        marginInlineEnd: TAG_MARGIN_INLINE_END,
        userSelect: 'none',
      }}
      onClick={handleClick}
    >
      <Badge data-icon="inline-start" variant="secondary">
        {title || t('defaultTitle')}
      </Badge>
    </span>
  );
});

ReferTopicView.displayName = 'ReferTopicView';
