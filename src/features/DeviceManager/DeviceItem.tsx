'use client';

import type { DeviceListItem } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import {
  EyeOffIcon,
  FolderIcon,
  GlobeIcon,
  MoreHorizontalIcon,
  Share2Icon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
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
import VisibilityConfirmContent from '@/features/VisibilityConfirmContent';
import { lambdaQuery } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { refreshDeviceList } from './const';
import { getDeviceIcon } from './getDeviceIcon';
import { openShareDeviceModal } from './ShareDeviceModal';
import { useCanEditDevice } from './useCanEditDevice';

const styles = createStaticStyles(({ css }) => ({
  // Liveness line. `flex: none` + no ellipsis: it is the shortest thing on the
  // row and the reason the row is readable at a glance — a long cwd next to it
  // must truncate itself rather than squeeze this out.
  activity: css`
    flex: none;
    font-size: ${cssVar.fontSizeSM};
    white-space: nowrap;
  `,
  // Code-font cwd line; truncates rather than wrapping so a deep path keeps the
  // row at one line.
  cwd: css`
    overflow: hidden;

    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  // Same tile treatment as the credential list rows (creds/features/style.ts).
  iconTile: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 48px;
    height: 48px;
    border-radius: 12px;

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  metaDivider: css`
    flex: none;
    width: 1px;
    height: 10px;
    background: ${cssVar.colorBorderSecondary};
  `,
  row: css`
    cursor: pointer;

    padding-block: 12px;
    padding-inline: 12px;
    border-radius: ${cssVar.borderRadius};

    transition: background 0.15s ease;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -1px;
    }

    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `,
  rowActive: css`
    background: ${cssVar.colorFillSecondary};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  statusOffline: css`
    width: 8px;
    height: 8px;
    border: 1.5px solid ${cssVar.colorTextQuaternary};
    border-radius: 50%;
  `,
  statusOnline: css`
    width: 8px;
    height: 8px;
    border-radius: 50%;

    background: ${cssVar.colorSuccess};
    box-shadow: 0 0 0 3px ${cssVar.colorSuccessBg};
  `,
}));

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
  const currentUserId = useUserStore(userProfileSelectors.userId);

  // Workspace devices are self-or-owner-gated + workspace-scoped on the
  // server; personal devices stay userId-scoped. Route by the device's own
  // scope.
  const onRemoveSuccess = () => refreshDeviceList();
  const removePersonal = lambdaQuery.device.removeDevice.useMutation({
    onSuccess: onRemoveSuccess,
  });
  const removeWorkspace = lambdaQuery.device.removeWorkspaceDevice.useMutation({
    onSuccess: onRemoveSuccess,
  });
  const removeDevice = device.scope === 'workspace' ? removeWorkspace : removePersonal;

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

  // Publish / make-private for workspace enrollments. Reuses the
  // shared visibility-confirm body so the consequences copy matches agents /
  // files. Success feedback is the row itself moving to the other tab after
  // the list refresh.
  const setVisibility = lambdaQuery.device.setWorkspaceDeviceVisibility.useMutation({
    onSuccess: () => refreshDeviceList(),
  });

  const handlePublish = () =>
    confirmModal({
      content: <VisibilityConfirmContent variant={'publish'} />,
      okText: t('devices.visibility.publish'),
      onOk: async () => {
        await setVisibility.mutateAsync({ deviceId: device.deviceId, visibility: 'public' });
      },
      title: t('devices.visibility.publishConfirmTitle'),
    });

  const handleMakePrivate = () =>
    confirmModal({
      content: <VisibilityConfirmContent variant={'makePrivate'} />,
      okButtonProps: { danger: true },
      okText: tCommon('makePrivate.confirm.ok'),
      onOk: async () => {
        await setVisibility.mutateAsync({ deviceId: device.deviceId, visibility: 'private' });
      },
      title: tCommon('makePrivate.confirm.title'),
    });

  // Only persisted workspace rows carry a visibility to toggle — ghosts
  // (unregistered) and personal devices don't. The toggle is enroller-only
  //: an owner demoting another member's public device would
  // move it into that member's private list, appropriating their data. The
  // server rejects non-enroller writes as the backstop.
  const isEnroller = !!currentUserId && device.enroller?.userId === currentUserId;
  const visibilityItems =
    device.scope === 'workspace' && device.registered && isEnroller
      ? device.visibility === 'private'
        ? [
            {
              icon: <GlobeIcon />,
              key: 'publish',
              label: t('devices.visibility.publish'),
              onClick: handlePublish,
            },
          ]
        : [
            {
              icon: <EyeOffIcon />,
              key: 'makePrivate',
              label: tCommon('makePrivate'),
              onClick: handleMakePrivate,
            },
          ]
      : [];

  // Share-to-workspace entry for personal enrollments. The share
  // handshake needs a live connection to mint the workspace identity, so the
  // item stays disabled (with an explanatory desc) while the device is offline.
  const shareItems =
    device.scope === 'personal' && device.registered
      ? [
          {
            desc: online ? undefined : t('devices.share.offlineDesc'),
            disabled: !online,
            icon: <Share2Icon />,
            key: 'share',
            label: t('devices.share.menu'),
            onClick: () => openShareDeviceModal(device),
          },
        ]
      : [];

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
    ...visibilityItems,
    ...shareItems,
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
      className={`flex items-center gap-4 ${cx(styles.row, selected && styles.rowActive)}`}
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
      <div className={styles.iconTile}>{getDeviceIcon(device.platform, 20)}</div>

      <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-2">
          <div className="truncate block text-[15px] font-medium">{displayName}</div>
          <span className={online ? styles.statusOnline : styles.statusOffline} />
          {isCurrent && <Tag>{t('devices.currentBadge')}</Tag>}
          {device.scope === 'workspace' && device.sharedFromPersonal && (
            // Member-shared machine (vs directly enrolled infra) — mirrors the
            // "Shared by {name}" tag on workspace connectors/credentials.
            <Tag>
              {t('devices.share.sharedByTag', {
                name:
                  device.enroller?.fullName ||
                  device.enroller?.username ||
                  t('workspaceSetting.devices.unknownEnroller'),
              })}
            </Tag>
          )}
          {device.scope === 'personal' && !!device.sharedWorkspaces?.length && (
            // At-a-glance "this machine also lives in N workspaces" marker;
            // the per-workspace list (and revoke) sits in the detail panel.
            <Tag>{t('devices.share.badge', { count: device.sharedWorkspaces.length })}</Tag>
          )}
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
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <div className={cn('text-muted-foreground', styles.activity)}>{activityText}</div>
          {device.defaultCwd && (
            <>
              <span className={styles.metaDivider} />
              <FolderIcon size={12} style={{ color: cssVar.colorTextQuaternary }} />
              <div className={cn('text-muted-foreground', styles.cwd)}>{device.defaultCwd}</div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2" style={{ flex: 'none' }}>
        {device.scope === 'workspace' && device.enroller && (
          // Enroller avatar — the at-a-glance "who put this here" answer for
          // shared workspace pools. Hidden in personal scope (always the
          // caller) and for ghost rows (no row yet).
          <Tooltip>
            <TooltipTrigger render={<span onClick={(e) => e.stopPropagation()} />}>
              <Avatar avatar={device.enroller.avatar ?? undefined} size={20} />
            </TooltipTrigger>
            <TooltipContent>
              {t('workspaceSetting.devices.enrolledBy', {
                name:
                  device.enroller.fullName ||
                  device.enroller.username ||
                  t('workspaceSetting.devices.unknownEnroller'),
              })}
            </TooltipContent>
          </Tooltip>
        )}
        {canEdit && (
          <span onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<span />}>
                <Button>
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
