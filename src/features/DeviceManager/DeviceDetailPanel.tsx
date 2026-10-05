'use client';

import { isDesktop } from '@orvilo/const';
import type { DeviceListItem, DeviceWorkspaceShare } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { FolderOpenIcon, FolderPlusIcon, LockIcon, XIcon } from 'lucide-react';
import { memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { confirmModal } from '@/components/Modal';
import { Badge as Tag } from '@/components/reui/badge';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DirIcon from '@/features/ChatInput/ControlBar/DirIcon';
import { openAddWorkingDirModal } from '@/features/WorkingDirectory';
import { createWorkspaceLambdaClient, lambdaQuery } from '@/libs/trpc/client';
import { getHostPort, hostResultOr } from '@/platform';
import { deviceService } from '@/services/device';
import { nextWorkingDirs } from '@/store/device';

import { refreshDeviceList } from './const';
import { getDeviceIcon } from './getDeviceIcon';
import { useCanEditDevice } from './useCanEditDevice';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    padding-block: 16px;
    padding-inline: 20px;
  `,
  dot: css`
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  `,
  header: css`
    padding-block-end: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  iconTile: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  path: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    font-family: ${cssVar.fontFamilyCode};
    font-size: ${cssVar.fontSizeSM};
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  recentItem: css`
    padding-block: 8px;
    padding-inline: 8px;
  `,
}));

// Section label — one consistent treatment for every field heading in the panel.
const FieldLabel = memo<{ children: ReactNode; extra?: ReactNode }>(({ children, extra }) => (
  <div className="flex items-center justify-between">
    <div className="text-[12px] text-muted-foreground font-medium">{children}</div>
    {extra}
  </div>
));

interface DeviceDetailPanelProps {
  device: DeviceListItem;
  isCurrent?: boolean;
  onClose: () => void;
}

const DeviceDetailPanel = memo<DeviceDetailPanelProps>(({ device, isCurrent, onClose }) => {
  const { t } = useTranslation(['setting', 'device']);
  const canEdit = useCanEditDevice()(device);

  const [name, setName] = useState(device.friendlyName ?? '');
  const [cwd, setCwd] = useState(device.defaultCwd ?? '');

  // Workspace devices commit via the self-or-owner-gated, workspace-scoped
  // mutation; personal devices stay userId-scoped. Route by the device's own
  // scope.
  const onUpdateSuccess = () => refreshDeviceList();
  const updatePersonal = lambdaQuery.device.updateDevice.useMutation({
    onSuccess: onUpdateSuccess,
  });
  const updateWorkspace = lambdaQuery.device.updateWorkspaceDevice.useMutation({
    onSuccess: onUpdateSuccess,
  });
  const update = device.scope === 'workspace' ? updateWorkspace : updatePersonal;

  // Only the machine you're on can browse its own filesystem natively.
  const canBrowse = !!isCurrent && isDesktop;

  // Render the device's live connections straight from `device.channels` — one
  // row per connection; an empty array means offline.
  const channels = device.channels ?? [];
  const online = channels.length > 0;

  // Every edit persists immediately — there is no Save button. Name and the
  // default cwd commit on blur; recent-dir add / remove / reorder commit on the
  // spot.
  const commitName = () => {
    const next = name.trim() || null;
    if (next === (device.friendlyName ?? null)) return;
    update.mutate({ deviceId: device.deviceId, friendlyName: next });
  };

  const commitCwd = (value: string, repoType?: 'git' | 'github') => {
    const trimmed = value.trim();
    update.mutate({
      defaultCwd: trimmed || null,
      deviceId: device.deviceId,
      // Setting a default cwd also seeds the working-dirs list.
      workingDirs: trimmed
        ? nextWorkingDirs({ path: trimmed, repoType }, device.workingDirs)
        : device.workingDirs,
    });
  };

  const handleCwdBlur = () => {
    if (cwd.trim() === (device.defaultCwd ?? '')) return;
    commitCwd(cwd);
  };

  const handleBrowse = async () => {
    const result = hostResultOr(
      await getHostPort().dialog.selectFolder({
        defaultPath: cwd.trim() || undefined,
        title: t('devices.edit.defaultCwd'),
      }),
      undefined,
    );
    if (result?.path) {
      setCwd(result.path);
      commitCwd(result.path, result.repoType);
    }
  };

  const addRecent = (entry: { path: string; repoType?: 'git' | 'github' }) => {
    update.mutate({
      deviceId: device.deviceId,
      workingDirs: nextWorkingDirs(entry, device.workingDirs),
    });
  };

  const handleAddRecent = async () => {
    // Browse this machine natively; other devices use the shared remote browser.
    if (canBrowse) {
      const result = hostResultOr(
        await getHostPort().dialog.selectFolder({
          title: t('devices.detail.addDir'),
        }),
        undefined,
      );
      if (result?.path) addRecent({ path: result.path, repoType: result.repoType });
      return;
    }

    openAddWorkingDirModal({
      defaultPath: device.defaultCwd || undefined,
      deviceId: device.deviceId,
      onSubmit: async (path) => {
        const result = await deviceService.statPath(device.deviceId, path);
        if (result) {
          if (!result.exists) return t('device:workingDirectory.pathNotExist');
          if (!result.isDirectory) return t('device:workingDirectory.pathNotDirectory');
        }
        addRecent({ path, repoType: result?.repoType });
        return undefined;
      },
      placeholder: device.defaultCwd || undefined,
    });
  };

  const handleRemoveRecent = (path: string) => {
    update.mutate({
      deviceId: device.deviceId,
      workingDirs: device.workingDirs.filter((d) => d.path !== path),
    });
  };

  // Revoke one workspace share of a personal device. The share
  // entry's `deviceId` is the workspace-scoped twin, removed via the
  // workspace-scoped mutation under an explicitly pinned workspace client —
  // the personal settings page has no active workspace context to inherit.
  const handleRevokeShare = (share: DeviceWorkspaceShare) =>
    confirmModal({
      content: t('devices.share.revokeConfirmDesc'),
      okButtonProps: { danger: true },
      okText: t('devices.share.revoke'),
      onOk: async () => {
        try {
          await createWorkspaceLambdaClient(share.workspaceId).device.removeWorkspaceDevice.mutate({
            deviceId: share.deviceId,
          });
          refreshDeviceList();
        } catch (error) {
          toast.error((error as Error).message);
          throw error;
        }
      },
      title: t('devices.share.revokeConfirmTitle', {
        name: share.workspaceName ?? share.workspaceId,
      }),
    });

  const handleReorderRecent = (items: { id: string }[]) => {
    // SortableList items are keyed by path; map ids back to their entries so the
    // detected repoType survives a reorder.
    const byPath = new Map(device.workingDirs.map((d) => [d.path, d]));
    update.mutate({
      deviceId: device.deviceId,
      workingDirs: items.map((item) => byPath.get(item.id) ?? { path: item.id }),
    });
  };

  return (
    <div className={`flex flex-col gap-5 ${styles.container}`}>
      {/* ─── Header ─── */}
      <div className={`flex items-center gap-3 ${styles.header}`}>
        <span className={styles.iconTile}>{getDeviceIcon(device.platform, 18)}</span>
        <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
          <div className="truncate block font-semibold">
            {device.friendlyName || device.hostname || device.deviceId}
          </div>
          <div className="flex items-center gap-2">
            <Tag size="sm" variant={online ? 'success' : 'default'}>
              {online
                ? t('devices.status.onlineConnections', { count: channels.length })
                : t('devices.status.offline')}
            </Tag>
            {isCurrent && <Tag size="sm">{t('devices.currentBadge')}</Tag>}
          </div>
        </div>
        <ActionIcon icon={XIcon} size={'small'} onClick={onClose} />
      </div>

      {/* Visible hint when the caller can't mutate the row — explains why the
          fields below are read-only without the user needing to try and hit a
          403. Only renders for workspace devices that aren't the caller's own
          enrollment (personal scope is always editable). */}
      {!canEdit && (
        <div className="flex items-center gap-2">
          <LockIcon size={14} style={{ color: cssVar.colorTextTertiary }} />
          <div className="text-[12px] text-muted-foreground">
            {t('workspaceSetting.devices.readonlyHint')}
          </div>
        </div>
      )}

      {/* ─── Enrolled by (workspace only) ─── */}
      {device.scope === 'workspace' && device.enroller && (
        <div className="flex flex-col gap-2">
          <FieldLabel>{t('workspaceSetting.devices.enrolledByLabel')}</FieldLabel>
          <div className="flex items-center gap-2">
            <Avatar avatar={device.enroller.avatar ?? undefined} size={24} />
            <div>
              {device.enroller.fullName ||
                device.enroller.username ||
                t('workspaceSetting.devices.unknownEnroller')}
            </div>
          </div>
        </div>
      )}

      {/* ─── Shared to workspaces (personal only) ─── */}
      {device.scope === 'personal' && !!device.sharedWorkspaces?.length && (
        <div className="flex flex-col gap-2">
          <FieldLabel>{t('devices.share.detailLabel')}</FieldLabel>
          {device.sharedWorkspaces.map((share) => (
            <div className="flex items-center gap-2" key={share.workspaceId}>
              <div className="truncate block" style={{ flex: 1, minWidth: 0 }}>
                {share.workspaceName ?? share.workspaceId}
              </div>
              <Tag size="sm">
                {share.visibility === 'private'
                  ? t('devices.share.visibilityTag.private')
                  : t('devices.share.visibilityTag.public')}
              </Tag>
              <ActionIcon
                icon={XIcon}
                size={'small'}
                title={t('devices.share.revoke')}
                onClick={() => handleRevokeShare(share)}
              />
            </div>
          ))}
        </div>
      )}

      {/* ─── Connections ─── */}
      <div className="flex flex-col gap-2">
        <FieldLabel>{t('devices.detail.connections')}</FieldLabel>
        {channels.length > 0 ? (
          channels.map((channel, index) => (
            <div className="flex items-center gap-2" key={`${channel.connectedAt}-${index}`}>
              <span className={styles.dot} style={{ background: cssVar.colorSuccess }} />
              {channel.channel && <Tag size="sm">{channel.channel}</Tag>}
              <div className="text-[12px] text-muted-foreground">
                {t('devices.channel.connected', { time: dayjs(channel.connectedAt).fromNow() })}
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2">
            <span className={styles.dot} style={{ background: cssVar.colorTextQuaternary }} />
            <div className="text-[12px] text-muted-foreground">
              {t('devices.status.offline')} ·{' '}
              {t('devices.lastSeen', { time: dayjs(device.lastSeen).fromNow() })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Name ─── */}
      <div className="flex flex-col gap-2">
        <FieldLabel>{t('devices.edit.friendlyName')}</FieldLabel>
        {canEdit ? (
          <Input
            placeholder={t('devices.edit.friendlyNamePlaceholder')}
            value={name}
            onBlur={commitName}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitName();
            }}
          />
        ) : device.friendlyName ? (
          // Read-only: render the canonical value (not the local draft), so a
          // value the caller can't actually commit never bleeds through.
          <div>{device.friendlyName}</div>
        ) : (
          <div className="text-muted-foreground">—</div>
        )}
      </div>

      {/* ─── Default working directory ─── */}
      <div className="flex flex-col gap-2">
        <FieldLabel>{t('devices.edit.defaultCwd')}</FieldLabel>
        {canEdit ? (
          <div className="flex gap-2">
            <Input
              placeholder={t('devices.edit.defaultCwdPlaceholder')}
              value={cwd}
              onBlur={handleCwdBlur}
              onChange={(e) => setCwd(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCwdBlur();
              }}
            />
            {canBrowse && (
              <Button onClick={handleBrowse}>
                {<FolderOpenIcon />}
                {t('devices.edit.browse')}
              </Button>
            )}
          </div>
        ) : device.defaultCwd ? (
          // Code font only when there's an actual path to read; empty falls back
          // to the same dash style as Name so the two fields look consistent.
          <div className={cn(styles.path)}>{device.defaultCwd}</div>
        ) : (
          <div className="text-muted-foreground">—</div>
        )}
      </div>

      {/* ─── Recent directories ─── */}
      <div className="flex flex-col gap-2">
        <FieldLabel
          extra={
            canEdit && (
              <ActionIcon
                icon={FolderPlusIcon}
                size={'small'}
                title={t('devices.detail.addDir')}
                onClick={handleAddRecent}
              />
            )
          }
        >
          {t('devices.detail.recentDirs')}
        </FieldLabel>
        {device.workingDirs.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">{t('devices.detail.noRecent')}</div>
        ) : canEdit ? (
          <Sortable
            getItemValue={(item: { id: string }) => item.id}
            value={device.workingDirs.map((d) => ({ id: d.path, repoType: d.repoType }))}
            onValueChange={handleReorderRecent}
          >
            {device.workingDirs.map((d) => {
              const item = { id: d.path, repoType: d.repoType };
              return (
                <SortableItem className={styles.recentItem} key={item.id} value={item.id}>
                  <SortableItemHandle />
                  <DirIcon repoType={item.repoType} />
                  <div className={cn(styles.path)} title={item.id}>
                    {item.id}
                  </div>
                  <ActionIcon
                    icon={XIcon}
                    size={'small'}
                    onClick={() => handleRemoveRecent(item.id)}
                  />
                </SortableItem>
              );
            })}
          </Sortable>
        ) : (
          // Read-only listing: same row layout minus the drag handle and the
          // remove button. Keeps the path + repo type icon visible for context.
          device.workingDirs.map((d) => (
            <div className={`flex items-center gap-2 ${styles.recentItem}`} key={d.path}>
              <DirIcon repoType={d.repoType} />
              <div className={cn(styles.path)} title={d.path}>
                {d.path}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

DeviceDetailPanel.displayName = 'DeviceDetailPanel';

export default DeviceDetailPanel;
