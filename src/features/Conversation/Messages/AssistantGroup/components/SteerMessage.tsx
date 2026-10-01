import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';

import { dataSelectors, useConversationStore } from '../../../store';
import UserMessageContent from '../../User/components/MessageContent';

const styles = createStaticStyles(({ css, cssVar }) => ({
  bubble: css`
    max-width: 100%;
    padding-block: 8px;
    padding-inline: 12px;
    border-radius: 12px;

    background: ${cssVar.colorFillTertiary};
  `,
}));

interface SteerMessageProps {
  id: string;
}

const SteerMessage = memo<SteerMessageProps>(({ id }) => {
  const { t } = useTranslation('chat');
  const item = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual);

  if (!item) return null;

  return (
    <div className="flex flex-col items-end" data-message-id={id} data-steer-message={id}>
      <div className={cn('flex flex-col items-start gap-1', styles.bubble)}>
        <Badge>{t('steer.tag')}</Badge>
        <UserMessageContent {...item} />
      </div>
    </div>
  );
});

SteerMessage.displayName = 'SteerMessage';

export default SteerMessage;
