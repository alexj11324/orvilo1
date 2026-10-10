'use client';

import { cn } from 'cn';
import { CheckCircle2, MonitorIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DeviceAttachment } from '../../../ExecutionRuntime/types';

const styles = {
  activated: 'text-success bg-[var(--ant-color-success-bg)]',
  badge:
    'inline-flex gap-1 items-center py-0.5 ps-2 pe-2 rounded-[var(--ant-border-radius-sm)] text-xs leading-4 whitespace-nowrap',
  card: 'py-3 ps-3 pe-3 border border-sidebar-border rounded-[var(--ant-border-radius)] bg-card',
  details:
    'truncate max-w-1/2 [font-family:var(--ant-font-family-code)] text-xs leading-[inherit] text-[var(--ant-color-text-description)] text-end',
  hostname: 'truncate text-sm leading-[inherit] font-medium',
  icon: 'flex-none size-8 rounded-[var(--radius-card)] text-muted-foreground bg-accent',
  listItem:
    'py-2.5 ps-3 pe-3 [&:not(:last-child)]:[border-block-end:1px_solid_var(--sidebar-border)]',
  root: 'w-full',
  status:
    'inline-flex flex-none gap-1.5 items-center text-xs leading-[inherit] text-muted-foreground',
  statusDot: 'size-[7px] border border-[var(--ant-color-text-quaternary)] rounded-full',
  statusDotOnline: 'border-0 bg-success shadow-[0_0_0_3px_var(--ant-color-success-bg)]',
};

interface DeviceCardProps {
  /** Render the activated treatment (check badge) instead of the online badge. */
  activated?: boolean;
  device: DeviceAttachment;
  variant?: 'card' | 'listItem';
}

const DeviceCard = memo<DeviceCardProps>(({ device, activated, variant = 'card' }) => {
  const { t } = useTranslation('plugin');
  const displayName = device.friendlyName || device.hostname;
  const scopeLabel = device.scope
    ? t(`builtins.orvilo-remote-device.render.scope.${device.scope}`)
    : undefined;
  const details = [device.friendlyName ? device.hostname : undefined, device.platform, scopeLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      role={variant === 'listItem' ? 'listitem' : undefined}
      className={cn(
        'flex flex-row items-center gap-3',
        cn(styles.root, variant === 'card' ? styles.card : styles.listItem),
      )}
    >
      <div className={cn('flex flex-col items-center justify-center', styles.icon)}>
        <span className="anticon" role="img">
          <MonitorIcon fill={'transparent'} height={18} size={18} width={18} />
        </span>
      </div>
      <div className="flex flex-row items-center flex-1 gap-2" style={{ minWidth: 0 }}>
        <span className={styles.hostname}>{displayName}</span>
        {!activated && (
          <span className={styles.status}>
            <span className={cn(styles.statusDot, device.online && styles.statusDotOnline)} />
            {t(
              device.online
                ? 'builtins.orvilo-remote-device.render.online'
                : 'builtins.orvilo-remote-device.render.offline',
            )}
          </span>
        )}
      </div>
      {activated ? (
        <span className={[styles.badge, styles.activated].join(' ')}>
          <span className="anticon" role="img">
            <CheckCircle2 fill={'transparent'} height={12} size={12} width={12} />
          </span>
          {t('builtins.orvilo-remote-device.render.activated')}
        </span>
      ) : (
        details && <span className={styles.details}>{details}</span>
      )}
    </div>
  );
});

DeviceCard.displayName = 'DeviceCard';

export default DeviceCard;
