'use client';

import type { AuthorizationErrorCode } from '@orvilo/electron-client-ipc';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { useElectronStore } from '@/store/electron';
import {
  AUTHORIZATION_ERROR_I18N_KEY,
  readAuthorizationErrorCode,
} from '@/utils/electron/authorizationError';

import { refreshDeviceList } from './const';
import { useDeviceList } from './useDeviceList';

const RETRY_PHASES = new Set(['registerFailed', 'gatewayUnreachable']);

/**
 * This machine's own connection state, shown above the personal device list.
 * Without it a failed registration looks identical to "no devices". Desktop only:
 * the store's gateway fetchers are gated by `isDesktop`, so on web `gatewayLocalState`
 * stays undefined and this renders nothing.
 */
const LocalDeviceStatus = memo(() => {
  const { t } = useTranslation('setting');
  const { t: tAuthorization } = useTranslation('desktop-onboarding');
  const localState = useElectronStore((s) => s.gatewayLocalState);
  const deviceInfo = useElectronStore((s) => s.gatewayDeviceInfo);
  const dataSyncConfig = useElectronStore((s) => s.dataSyncConfig);
  const connectRemoteServer = useElectronStore((s) => s.connectRemoteServer);
  const useFetchGatewayStatus = useElectronStore((s) => s.useFetchGatewayStatus);
  const useFetchGatewayDeviceInfo = useElectronStore((s) => s.useFetchGatewayDeviceInfo);
  const { data: devices } = useDeviceList();
  const [busy, setBusy] = useState(false);
  const [signInFailure, setSignInFailure] = useState<AuthorizationErrorCode>();

  useFetchGatewayStatus();
  useFetchGatewayDeviceInfo();

  if (!localState) return null;

  const listed = !!devices?.some((d) => d.deviceId === deviceInfo?.deviceId);
  // Healthy and already in the list below: that row is the status.
  if (localState.phase === 'connected' && listed) return null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.error('Device status action failed:', error);
    } finally {
      setBusy(false);
      void refreshDeviceList();
    }
  };

  const retry = () => run(() => gatewayConnectionService.connect());
  const signIn = () =>
    run(async () => {
      setSignInFailure(undefined);
      try {
        await connectRemoteServer({
          remoteServerUrl: dataSyncConfig?.remoteServerUrl,
          storageMode: dataSyncConfig?.storageMode || 'cloud',
        });
      } catch (error) {
        // Say why sign-in failed; the Sign in button stays available to retry.
        setSignInFailure(readAuthorizationErrorCode(error) ?? 'server_error');
        throw error;
      }
      await gatewayConnectionService.connect();
    });

  const action =
    localState.phase === 'signInRequired'
      ? { label: t('devices.local.signIn'), onClick: signIn }
      : RETRY_PHASES.has(localState.phase)
        ? { label: t('devices.local.retry'), onClick: retry }
        : undefined;

  return (
    <div
      data-testid="local-device-status"
      className={
        'flex items-center justify-between gap-3 rounded-(--radius-card) border px-3 py-2 text-sm'
      }
    >
      <div className={'flex min-w-0 flex-col'}>
        <span className={'font-medium'}>
          {t('devices.currentBadge')}
          {deviceInfo?.hostname ? ` · ${deviceInfo.hostname}` : ''}
        </span>
        <span className={'text-muted-foreground'}>
          {t(`devices.local.phase.${localState.phase}`)}
        </span>
        {localState.reason && (
          <span className={'text-muted-foreground break-words text-xs'}>
            {t('devices.local.reason', { reason: localState.reason })}
          </span>
        )}
        {signInFailure && localState.phase === 'signInRequired' && (
          <span className={'text-destructive-text break-words text-xs'} role="alert">
            {tAuthorization(AUTHORIZATION_ERROR_I18N_KEY[signInFailure])}
          </span>
        )}
      </div>
      {action && (
        <Button disabled={busy} size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
});

LocalDeviceStatus.displayName = 'LocalDeviceStatus';

export default LocalDeviceStatus;
