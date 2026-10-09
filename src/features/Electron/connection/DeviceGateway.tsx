import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { createStaticStyles, cx } from 'antd-style';
import { HardDrive, SettingsIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceSlug } from '@/business/client/hooks/useActiveWorkspaceSlug';
import ActionIcon from '@/components/ActionIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  getScopedConnectionCount,
  getWorkspaceConnectionState,
} from '@/features/DeviceManager/connectionCount';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  greenDot: css`
    position: absolute;
    inset-block-end: 0;
    inset-inline-end: 0;

    width: 8px;
    height: 8px;
    border: 1.5px solid ${cssVar.colorBgContainer};
    border-radius: 50%;

    background: #52c41a;
  `,
  popoverContent: css`
    width: 250px;
  `,
  scopeHint: css`
    font-size: 11px;
    line-height: 1.4;
    color: ${cssVar.colorTextDescription};
    white-space: nowrap;
  `,
  statusTitle: css`
    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

interface DeviceGatewayProps {
  workspaceScoped: boolean;
}

const DeviceGateway = memo<DeviceGatewayProps>(({ workspaceScoped }) => {
  const { t } = useTranslation('electron');
  const navigate = useWorkspaceAwareNavigate();
  const [
    gatewayStatus,
    connectGateway,
    disconnectGateway,
    setGatewayConnectionStatus,
    setGatewayLocalState,
    useFetchGatewayStatus,
  ] = useElectronStore((s) => [
    s.gatewayConnectionStatus,
    s.connectGateway,
    s.disconnectGateway,
    s.setGatewayConnectionStatus,
    s.setGatewayLocalState,
    s.useFetchGatewayStatus,
  ]);

  useFetchGatewayStatus();
  useElectronStore((s) => s.useFetchGatewayDeviceInfo)();
  const gatewayDeviceInfo = useElectronStore((s) => s.gatewayDeviceInfo);
  const { data: devices, error: deviceListError, isLoading: isDeviceListLoading } = useDeviceList();

  useWatchBroadcast('gatewayConnectionStatusChanged', ({ localState, status }) => {
    setGatewayConnectionStatus(status);
    setGatewayLocalState(localState);
  });

  const isConnected = gatewayStatus === 'connected';
  const isConnecting =
    gatewayStatus === 'authenticating' ||
    gatewayStatus === 'connecting' ||
    gatewayStatus === 'reconnecting';

  const [open, setOpen] = useState(false);

  const handleSwitchChange = useCallback(
    async (checked: boolean) => {
      if (checked) {
        await connectGateway();
      } else {
        await disconnectGateway();
      }
    },
    [connectGateway, disconnectGateway],
  );

  const connectionCount = getScopedConnectionCount(
    devices,
    workspaceScoped ? 'workspace' : 'personal',
    workspaceScoped ? undefined : gatewayDeviceInfo?.deviceId,
  );
  const workspaceConnectionState = getWorkspaceConnectionState(
    devices,
    isDeviceListLoading,
    deviceListError,
  );
  const scopeConnected = workspaceScoped ? workspaceConnectionState === 'connected' : isConnected;
  const connectionHint = workspaceScoped
    ? workspaceConnectionState === 'unavailable'
      ? t('gateway.workspaceStatusUnavailable')
      : workspaceConnectionState === 'connecting'
        ? t('gateway.statusConnecting')
        : workspaceConnectionState === 'connected'
          ? t('gateway.workspaceStatusConnections', { count: connectionCount })
          : t('gateway.workspaceStatusDisconnected')
    : isConnecting
      ? t('gateway.statusConnecting')
      : isConnected && connectionCount
        ? t('gateway.statusConnectedConnections', { count: connectionCount })
        : t(isConnected ? 'gateway.statusConnected' : 'gateway.statusDisconnected');

  const popoverContent = (
    <div className={cx(styles.popoverContent, 'flex flex-col gap-1')}>
      <div className="flex items-center justify-between">
        <span className={styles.statusTitle}>{t('gateway.title')}</span>
        <div className="flex items-center gap-1.5">
          <ActionIcon
            aria-label={t('gateway.manageDevices')}
            icon={SettingsIcon}
            size="small"
            title={t('gateway.manageDevices')}
            onClick={() => {
              setOpen(false);
              navigate('/settings/devices');
            }}
          />
          {!workspaceScoped && (
            <Switch
              aria-label={t('gateway.enableConnection')}
              checked={isConnected || isConnecting}
              disabled={isConnecting}
              size="sm"
              onCheckedChange={handleSwitchChange}
            />
          )}
        </div>
      </div>
      <span className={styles.scopeHint}>{connectionHint}</span>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div style={{ position: 'relative' }}>
        <PopoverTrigger
          render={
            <ActionIcon
              icon={HardDrive}
              loading={isConnecting}
              size="small"
              title={t('gateway.title')}
              tooltipProps={{ placement: 'bottomRight' }}
            />
          }
        />
        {scopeConnected && <div className={styles.greenDot} />}
      </div>
      <PopoverContent align="end" className="w-auto" side="bottom" style={{ padding: 8 }}>
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
});

const DeviceGatewayWithAuth = memo(() => {
  const isSyncActive = useElectronStore(electronSyncSelectors.isSyncActive);
  const activeWorkspaceSlug = useActiveWorkspaceSlug();

  if (!isSyncActive) return null;

  return <DeviceGateway workspaceScoped={!!activeWorkspaceSlug} />;
});

export default DeviceGatewayWithAuth;
