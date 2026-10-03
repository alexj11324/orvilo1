import type { DetectedApp, OpenInAppId } from '@orvilo/electron-client-ipc';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { toast } from '@/components/toast';
import { openInAppKeys } from '@/libs/swr/keys';
import { getHostPort, hasHostCapability, hostResultOr } from '@/platform';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';

import { resolveDefaultApp } from './apps';

export interface UseOpenInAppResult {
  defaultApp: OpenInAppId;
  installedApps: DetectedApp[];
  launch: (appId: OpenInAppId) => Promise<void>;
  ready: boolean;
}

export const useOpenInApp = (workingDirectory: string): UseOpenInAppResult => {
  const { t } = useTranslation('openInApp');

  // SWR fetch detection once per session; main caches anyway. Gated on the
  // host capability, not the shell kind — this button only makes sense where
  // a host can launch native apps against local paths.
  const canLaunch = hasHostCapability('shell.openTerminal');
  const { data } = useSWR(
    canLaunch ? openInAppKeys.detect() : null,
    async () => {
      const result = await getHostPort().shell.detectApps();
      return hostResultOr(result, { apps: [] });
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  const installedApps = useMemo(() => data?.apps.filter((app) => app.installed) ?? [], [data]);
  const installedIds = useMemo(() => new Set(installedApps.map((app) => app.id)), [installedApps]);
  const displayNameMap = useMemo(
    () => new Map(installedApps.map((app) => [app.id, app.displayName])),
    [installedApps],
  );

  const userDefault = useUserStore(preferenceSelectors.defaultOpenInApp);
  const updatePreference = useUserStore((s) => s.updatePreference);

  const defaultApp = useMemo(
    () => resolveDefaultApp(userDefault, installedIds, window.orviloEnv?.platform ?? 'darwin'),
    [userDefault, installedIds],
  );

  const launch = useCallback(
    async (appId: OpenInAppId): Promise<void> => {
      const appName = displayNameMap.get(appId) ?? appId;

      // The path must provably live on this host's own device: the adapter
      // refuses anything whose deviceId isn't the resolved local identity.
      const localDeviceId = await getHostPort().ensureLocalDeviceId();
      const result = localDeviceId
        ? await getHostPort().shell.openInApp({
            appId,
            resource: { deviceId: localDeviceId, path: workingDirectory },
          })
        : ({
            error: { code: 'TARGET_QUERY_FAILED' as const },
            status: 'error' as const,
          } as const);

      if (result.status === 'ok') {
        const open = result.value;
        if (open.success) {
          if (appId !== userDefault) {
            await updatePreference({ defaultOpenInApp: appId });
          }
          return;
        }

        const err = open.error ?? '';
        if (err.startsWith('Path not found')) {
          toast.error(t('errors.pathNotFound', { path: workingDirectory }));
        } else if (err.includes('is not installed')) {
          toast.error(t('errors.appNotInstalled', { appName }));
        } else {
          toast.error(t('errors.launchFailed', { appName, error: err || t('errors.unknown') }));
        }
        return;
      }

      const reason = result.error.message ?? result.error.code;
      toast.error(t('errors.launchFailed', { appName, error: reason }));
    },
    [displayNameMap, workingDirectory, userDefault, updatePreference, t],
  );

  return { defaultApp, installedApps, launch, ready: !!data };
};
