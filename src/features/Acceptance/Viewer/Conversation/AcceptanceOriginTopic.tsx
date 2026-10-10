'use client';

import { MessagesSquare } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useAcceptanceScope } from '../AcceptanceScope';
import { useAcceptanceBundle } from '../useAcceptanceBundle';
import { useOriginConversation } from './originConversation';

const styles = {
  chip: 'cursor-pointer border-0 bg-none bg-transparent p-0 text-muted-foreground hover:text-foreground hover:underline',
};

const AcceptanceOriginTopic = () => {
  const { t } = useTranslation('verify');
  const { acceptanceId, embedded } = useAcceptanceScope();
  const { data } = useAcceptanceBundle(acceptanceId);
  const originConversation = useOriginConversation();
  const openTopic = useCallback(() => {
    if (!originConversation || !data?.origin?.topic) return;
    originConversation.openTopicDrawer(data.origin.topic.id, {
      agentId: data.origin.agent?.id,
      title: data.origin.topic.title ?? data.subject.title ?? data.origin.topic.id,
    });
  }, [data, originConversation]);

  if (embedded || !data?.origin?.topic || !originConversation) return null;

  return (
    <button
      className={styles.chip}
      style={{ font: 'inherit' }}
      title={t('acceptance.origin.openTopic')}
      type={'button'}
      onClick={openTopic}
    >
      <div className="flex items-center gap-1">
        <MessagesSquare size={13} />
        {data.origin.topic.title ?? data.subject.title ?? data.origin.topic.id}
      </div>
    </button>
  );
};

export default AcceptanceOriginTopic;
