import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { cn } from 'cn';
import { HardDrive, SettingsIcon } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  getDeviceConnectionCount,
  getDeviceConnectionState,
} from '@/features/DeviceManager/connectionCount';
import { useDeviceList } from '@/features/DeviceManager/useDeviceList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';

import { resolveGatewayHints } from './gatewayHints';

const styles = {
  greenDot:
    'absolute inset-be-0 inset-e-0 size-2 rounded-full border-[length:calc(var(--spacing)*0.375)] border-solid border-card bg-success',
  popoverContent: 'w-62.5',
  scopeHint: 'text-xs leading-5 text-foreground-description whitespace-nowrap',
  statusTitle: 'text-sm leading-5.5 font-medium text-foreground',
};

const DeviceGateway = memo(() => {
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

  const connectionCount = getDeviceConnectionCount(devices);
  const connectionState = getDeviceConnectionState(devices, isDeviceListLoading, deviceListError);
  const hints = resolveGatewayHints({
    connectionCount: connectionCount ?? 0,
    connectionState,
    isConnected,
    isConnecting,
  });
  const connectionHint =
    hints.connection.count === undefined
      ? t(hints.connection.key)
      : t(hints.connection.key, { count: hints.connection.count });

  const popoverContent = (
    <div className={cn(styles.popoverContent, 'flex flex-col gap-1')}>
      <div className="flex items-center justify-between">
        <span className={styles.statusTitle}>{t('gateway.title')}</span>
        <div className="flex items-center gap-1.5">
          <ActionIcon
            aria-label={t('gateway.manageDevices')}
            icon={SettingsIcon}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            title={t('gateway.manageDevices')}
            onClick={() => {
              setOpen(false);
              navigate('/settings/devices');
            }}
          />
          {
            <Switch
              aria-label={t('gateway.enableConnection')}
              checked={isConnected || isConnecting}
              className="transition-[background-color,border-color,box-shadow,opacity] duration-(--orvilo-motion-fast)"
              disabled={isConnecting}
              size="sm"
              onCheckedChange={handleSwitchChange}
            />
          }
        </div>
      </div>
      <span className={styles.scopeHint}>{connectionHint}</span>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger
          render={
            <ActionIcon
              icon={HardDrive}
              loading={isConnecting}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('gateway.title')}
              tooltipProps={{ placement: 'bottomRight' }}
            />
          }
        />
        {hints.showConnectedDot && <div className={styles.greenDot} />}
      </div>
      <PopoverContent align="end" className="w-auto p-2" side="bottom">
        {popoverContent}
      </PopoverContent>
    </Popover>
  );
});

const DeviceGatewayWithAuth = memo(() => {
  const isSyncActive = useElectronStore(electronSyncSelectors.isSyncActive);

  if (!isSyncActive) return null;

  return <DeviceGateway />;
});

export default DeviceGatewayWithAuth;
