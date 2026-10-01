import { agentDisplayName } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActivityTime } from '@/hooks/useActivityTime';

import { type ChatItemProps } from '../type';

export interface TitleProps {
  avatar: ChatItemProps['avatar'];
  showTitle?: ChatItemProps['showTitle'];
  time?: ChatItemProps['time'];
  titleAddon?: ChatItemProps['titleAddon'];
}

const Title = memo<TitleProps>(({ showTitle, time, avatar, titleAddon }) => {
  const { t } = useTranslation('chat');
  const title = agentDisplayName(avatar, t('untitledAgent'));
  const { text: timeText, title: timeTitle } = useActivityTime(time);

  return (
    <>
      {showTitle && <div className="text-[14px] font-medium">{title}</div>}
      {showTitle ? titleAddon : undefined}
      {!timeText ? null : (
        <time
          aria-label="published-date"
          className="text-[12px] text-muted-foreground"
          title={timeTitle}
        >
          {timeText}
        </time>
      )}
    </>
  );
});

export default Title;
