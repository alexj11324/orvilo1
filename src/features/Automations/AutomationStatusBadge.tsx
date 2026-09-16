import { Center } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AutomationStatus } from './shared';

const STATUS_COLOR: Record<AutomationStatus, string> = {
  active: cssVar.colorSuccess,
  paused: cssVar.colorTextDescription,
};

interface AutomationStatusBadgeProps {
  status: AutomationStatus;
}

/** Dot + label for a task's automation state (mirrors Cordy's status cell). */
const AutomationStatusBadge = memo<AutomationStatusBadgeProps>(({ status }) => {
  const { t } = useTranslation('automation');
  return (
    <Center horizontal gap={6}>
      <span
        style={{
          background: STATUS_COLOR[status],
          borderRadius: '50%',
          display: 'inline-block',
          flexShrink: 0,
          height: 8,
          width: 8,
        }}
      />
      <Text fontSize={12} type={'secondary'}>
        {t(`status.${status}`)}
      </Text>
    </Center>
  );
});

export default AutomationStatusBadge;
