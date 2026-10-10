import isEqual from 'fast-deep-equal';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';

import { dataSelectors, useConversationStore } from '../../../store';
import UserMessageContent from '../../User/components/MessageContent';

interface SteerMessageProps {
  id: string;
}

const SteerMessage = memo<SteerMessageProps>(({ id }) => {
  const { t } = useTranslation('chat');
  const item = useConversationStore(dataSelectors.getDisplayMessageById(id), isEqual);

  if (!item) return null;

  return (
    <div className="flex flex-col items-end" data-message-id={id} data-steer-message={id}>
      <div className="flex max-w-full flex-col items-start gap-1 rounded-(--radius-card) bg-muted px-3 py-2">
        <Badge>{t('steer.tag')}</Badge>
        <UserMessageContent {...item} />
      </div>
    </div>
  );
});

SteerMessage.displayName = 'SteerMessage';

export default SteerMessage;
