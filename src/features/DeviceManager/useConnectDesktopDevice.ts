import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { deviceService } from '@/services/device';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { useElectronStore } from '@/store/electron';

import { refreshDeviceList } from './const';

/** Connect the user-owned machine and confirm its authoritative registration. */
export const useConnectDesktopDevice = ({
  onClose,
  open = true,
}: {
  onClose: () => void;
  open?: boolean;
}) => {
  const { t } = useTranslation('setting');
  const fetchIdentity = useElectronStore((s) => s.useFetchGatewayDeviceInfo);
  const identity = fetchIdentity();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => setError(undefined), [open]);

  const connect = async () => {
    setConnecting(true);
    setError(undefined);
    try {
      const result = await gatewayConnectionService.connect();
      if (!result.success)
        throw new Error(result.error || t('devices.connectWizard.desktop.connectFailed'));
      const deadline = Date.now() + 15_000;
      while ((await gatewayConnectionService.getConnectionStatus()).status !== 'connected') {
        if (Date.now() >= deadline)
          throw new Error(t('devices.connectWizard.desktop.connectFailed'));
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const info = await identity.mutate();
      if (!info) throw new Error(t('devices.connectWizard.desktop.identityUnavailable'));
      const devices = await deviceService.listDevices();
      const personal = devices.find((d) => d.deviceId === info.deviceId && d.registered);
      if (!personal) throw new Error(t('devices.connectWizard.desktop.registrationPending'));

      await refreshDeviceList();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('devices.connectWizard.desktop.connectFailed'),
      );
    } finally {
      setConnecting(false);
    }
  };

  return { connect, connecting, error, identity };
};
