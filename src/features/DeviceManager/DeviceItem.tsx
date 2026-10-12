'use client';

import type { DeviceListItem } from '@orvilo/types';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { FolderIcon, MoreHorizontalIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { Badge as Tag } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { lambdaQuery } from '@/libs/trpc/client';

import { refreshDeviceList } from './const';
import { getDeviceIcon } from './getDeviceIcon';
import { useCanEditDevice } from './useCanEditDevice';

const styles = {
  activity: 'flex-none text-xs leading-5 whitespace-nowrap',
  cwd: 'truncate font-mono text-xs leading-5',
  iconTile:
    'flex shrink-0 items-center justify-center size-12 rounded-(--radius-card) text-muted-foreground bg-muted',
  metaDivider: 'flex-none w-px h-2.5 bg-divider',
  row: 'cursor-pointer p-3 rounded-(--radius-card) transition-[background-color] duration-(--orvilo-motion-fast) ease-in-out focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-1 motion-reduce:transition-none',
  rowActive: 'bg-selected hover:bg-selected',
  statusOffline: 'size-2 border-1.5 border-foreground-quaternary rounded-full',
  statusOnline: 'size-2 rounded-full bg-success ring-3 ring-success-wash',
};

interface DeviceItemProps {
  device: DeviceListItem;
  isCurrent?: boolean;
  onSelect: () => void;
  selected?: boolean;
}

interface DeviceMenuItem {
  danger?: boolean;
  desc?: string;
  disabled?: boolean;
  icon: ReactNode;
  key: string;
  label: ReactNode;
  onClick: () => void;
}

const DeviceItem = memo<DeviceItemProps>(({ device, isCurrent, onSelect, selected }) => {
  const { t } = useTranslation('setting');
  const { t: tCommon } = useTranslation('common');
  const canEdit = useCanEditDevice()(device);

  const onRemoveSuccess = () => refreshDeviceList();
  const removePersonal = lambdaQuery.device.removeDevice.useMutation({
    onSuccess: onRemoveSuccess,
  });
  const removeDevice = removePersonal;

  const displayName = device.friendlyName || device.hostname || device.deviceId;
  const isFallback = device.identitySource === 'fallback';
  // Online when the device has at least one live connection in `device.channels`.
  const channels = device.channels ?? [];
  const online = channels.length > 0;
  // Rendered inline (not as a dot tooltip): "when was this machine last
  // reachable" is the answer needed to pick between rows, and hover can't
  // answer it for a whole list at once — nor at all on touch.
  //
  // Online reads the gateway's live `connectedAt` from `channels[0]` — the
  // newest connection, since the pool is sorted newest-first in
  // `deviceGateway.queryDeviceList`. That is the same channel
  // `sortDevicesByActivity` ranks this row by, so the label always explains
  // the row's position.
  //
  // Offline can only report `lastSeen`, which is stamped on register — and
  // every client registers right before opening its WS
  // (`gatewayConnectionSrv`, CLI `registerDevice`) — so it means "last
  // CONNECTED", not "last active". The copy says exactly that; it becomes a
  // true last-active once a writer stamps liveness.
  const activityText = online
    ? `${t('devices.status.onlineConnections', { count: channels.length })} · ${t(
        'devices.channel.connected',
        {
          time: dayjs(channels[0]?.connectedAt ?? device.lastSeen).fromNow(),
        },
      )}`
    : t('devices.lastSeen', { time: dayjs(device.lastSeen).fromNow() });

  const handleRemove = () =>
    confirmModal({
      content: isCurrent
        ? `${t('devices.remove.confirmDesc')}\n\n${t('devices.remove.currentSessionWarning')}`
        : t('devices.remove.confirmDesc'),
      okButtonProps: { danger: true },
      okText: t('devices.actions.remove'),
      onOk: async () => {
        await removeDevice.mutateAsync({ deviceId: device.deviceId });
      },
      title: t('devices.remove.confirm'),
    });

  const deviceMenuItems: DeviceMenuItem[] = [
    {
      danger: true,
      icon: <Trash2Icon />,
      key: 'remove',
      label: t('devices.actions.remove'),
      onClick: handleRemove,
    },
  ];

  return (
    <div
      aria-pressed={selected}
      className={`flex items-center gap-4 ${cn(styles.row, selected ? styles.rowActive : 'hover:bg-accent')}`}
      role={'button'}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        // Mirror native button keyboard semantics for the div-as-button row.
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.iconTile}>{getDeviceIcon(device.platform, 16)}</div>

      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <div className="flex items-center gap-2">
          <div className="truncate block text-sm font-medium">{displayName}</div>
          <span className={online ? styles.statusOnline : styles.statusOffline} />
          {isCurrent && <Tag>{t('devices.currentBadge')}</Tag>}

          {isFallback && (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Tag>
                  {<TriangleAlertIcon />}
                  {t('devices.fallbackBadge')}
                </Tag>
              </TooltipTrigger>
              <TooltipContent>{t('devices.fallbackTooltip')}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center min-w-0 gap-2">
          <div className={cn('text-muted-foreground', styles.activity)}>{activityText}</div>
          {device.defaultCwd && (
            <>
              <span className={styles.metaDivider} />
              <FolderIcon className="size-4 text-foreground-quaternary" size={16} />
              <div className={cn('text-muted-foreground', styles.cwd)}>{device.defaultCwd}</div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-none items-center gap-2">
        {canEdit && (
          <span onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<span />}>
                <Button aria-label={tCommon('more')} size="compact" type="button">
                  <MoreHorizontalIcon data-icon="inline-start" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={'end'}>
                {deviceMenuItems.map((item) => (
                  <DropdownMenuItem
                    disabled={item.disabled}
                    key={item.key}
                    title={item.desc}
                    variant={item.danger ? 'destructive' : undefined}
                    onClick={item.onClick}
                  >
                    {item.icon}
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </div>
    </div>
  );
});

DeviceItem.displayName = 'DeviceItem';

export default DeviceItem;
