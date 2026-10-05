import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

const Title = memo(() => {
  const { t } = useTranslation('chat');
  const view = useChatStore(chatPortalSelectors.goalMetricView);
  if (!view) return null;

  return (
    <div className="font-medium" style={{ fontSize: 14 }}>
      {t(`goalProcess.metricDetail.${view.metric}.title` as const)}
    </div>
  );
});

export default Title;
