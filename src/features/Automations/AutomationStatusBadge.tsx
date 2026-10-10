import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { AutomationStatus } from './shared';

const STATUS_COLOR: Record<AutomationStatus, string> = {
  active: 'var(--success)',
  inactive: 'var(--ant-color-text-quaternary)',
  paused: 'var(--ant-color-text-description)',
};

interface AutomationStatusBadgeProps {
  status: AutomationStatus;
}

/** Dot + label for a task's automation state (mirrors Cordy's status cell). */
const AutomationStatusBadge = memo<AutomationStatusBadgeProps>(({ status }) => {
  const { t } = useTranslation('automation');
  return (
    <div className="flex items-center justify-center gap-1.5">
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
      <div className="text-[12px] text-muted-foreground">{t(`status.${status}`)}</div>
    </div>
  );
});

export default AutomationStatusBadge;
