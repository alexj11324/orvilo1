'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors, topicSelectors } from '@/store/chat/selectors';

const Title = memo(() => {
  const { t } = useTranslation('topic');
  const title = useChatStore((s) => {
    const topicId = chatPortalSelectors.portalTopicId(s);
    return topicId ? topicSelectors.getTopicById(topicId)(s)?.title : undefined;
  });

  return (
    <div className="truncate min-w-0" style={{ fontSize: 14, fontWeight: 500 }}>
      {title || t('defaultTitle')}
    </div>
  );
});

Title.displayName = 'PortalTopicTitle';

export default Title;
