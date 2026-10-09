import type { DeviceScope, DeviceVisibility } from '@orvilo/types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspace } from '@/business/client/hooks/useActiveWorkspace';
import { confirmModal } from '@/components/Modal';
import { createWorkspaceLambdaClient } from '@/libs/trpc/client';
import { deviceService } from '@/services/device';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { useElectronStore } from '@/store/electron';

import { refreshDeviceList } from './const';

/** Connect once, then explicitly enroll the registered personal machine in the chosen pool. */
export const useConnectDesktopDevice = ({
  scope,
  visibility = 'private',
  onClose,
  open = true,
}: {
  onClose: () => void;
  open?: boolean;
  scope: DeviceScope;
  visibility?: DeviceVisibility;
}) => {
  const { t } = useTranslation('setting');
  const workspace = useActiveWorkspace();
  const fetchIdentity = useElectronStore((s) => s.useFetchGatewayDeviceInfo);
  const identity = fetchIdentity();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => setError(undefined), [open]);

  const connect = async () => {
    setConnecting(true);
    setError(undefined);
    try {
      if (scope === 'workspace' && !workspace)
        throw new Error(t('devices.connectWizard.desktop.workspaceRequired'));
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
      const personal = devices.find(
        (d) => d.scope === 'personal' && d.deviceId === info.deviceId && d.registered,
      );
      if (!personal) throw new Error(t('devices.connectWizard.desktop.registrationPending'));

      if (scope === 'workspace' && workspace) {
        const target = workspace;
        const share = async (confirmOverwrite?: boolean) => {
          setConnecting(true);
          setError(undefined);
          try {
            const enrollment = await createWorkspaceLambdaClient(
              target.id,
            ).device.shareDeviceToWorkspace.mutate({
              confirmOverwrite,
              deviceId: personal.deviceId,
              visibility,
            });
            if (!enrollment.success && enrollment.alreadyEnrolled) {
              const label = (value: DeviceVisibility) =>
                t(
                  value === 'public'
                    ? 'devices.share.visibilityTag.public'
                    : 'devices.share.visibilityTag.private',
                );
              confirmModal({
                content: t('devices.share.overwriteConfirmDesc', {
                  current: label(enrollment.visibility ?? 'public'),
                  name: target.name,
                  next: label(visibility),
                }),
                okText: t('devices.share.overwriteConfirmOk'),
                onOk: () => share(true),
                title: t('devices.share.overwriteConfirmTitle', { name: target.name }),
              });
              return;
            }
            if (!enrollment.success)
              throw new Error(t('devices.connectWizard.desktop.enrollFailed'));
            await refreshDeviceList();
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : t('devices.connectWizard.desktop.enrollFailed'),
            );
          } finally {
            setConnecting(false);
          }
        };
        await share();
      } else {
        await refreshDeviceList();
        onClose();
      }
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
