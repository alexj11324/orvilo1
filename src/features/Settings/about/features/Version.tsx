import { BRANDING_NAME } from '@orvilo/business-const';
import { isDesktop } from '@orvilo/const';
import { type UpdaterState, useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { createStaticStyles } from 'antd-style';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ProductLogo } from '@/components/Branding';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CHANGELOG_URL, MANUAL_UPGRADE_URL, OFFICIAL_SITE } from '@/const/url';
import { CURRENT_VERSION } from '@/const/version';
import { useNewVersion } from '@/features/User/UserPanel/useNewVersion';
import { getHostPort, hostResultOr } from '@/platform';
import { useGlobalStore } from '@/store/global';
import {
  featureFlagsSelectors,
  serverConfigSelectors,
  useServerConfigStore,
} from '@/store/serverConfig';
import {
  advanceDevDockClickSequence,
  INITIAL_DEV_DOCK_CLICK_SEQUENCE,
  toggleDevDockUnlocked,
} from '@/utils/devDockUnlock';

import { APP_VERSION } from './appVersion';

const styles = createStaticStyles(({ css, cssVar }) => ({
  logo: css`
    border-radius: calc(${cssVar.borderRadiusLG} * 2);
  `,
}));

const Version = memo<{ mobile?: boolean }>(({ mobile }) => {
  const hasNewVersion = useNewVersion();
  const [latestVersion, serverVersion, useCheckServerVersion, useCheckLatestVersion] =
    useGlobalStore((s) => [
      s.latestVersion,
      s.serverVersion,
      s.useCheckServerVersion,
      s.useCheckLatestVersion,
    ]);
  const { t } = useTranslation(['common', 'setting']);

  useCheckServerVersion();

  // Read the shared latest-version check state (deduped by key, no extra fetch)
  // so a failed update check can surface a retry instead of silently rendering
  // nothing — which is indistinguishable from "up to date".
  const { enableCheckUpdates } = useServerConfigStore(featureFlagsSelectors);
  const canAccessDevDock = useServerConfigStore((s) => s.canAccessDevDock);
  const devDockClickSequence = useRef(INITIAL_DEV_DOCK_CLICK_SEQUENCE);
  const {
    error: updateCheckError,
    isValidating: isCheckingUpdate,
    mutate: recheckUpdate,
  } = useCheckLatestVersion(enableCheckUpdates);

  const showServerVersion = serverVersion && serverVersion !== CURRENT_VERSION;
  // Hosted deployments upgrade themselves server-side; the manual upstream-sync
  // link is only meaningful for a self-hosted install the operator must bump.
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const showManualUpgrade = !enableBusinessFeatures;

  const [updaterState, setUpdaterState] = useState<UpdaterState>({ stage: 'idle' });
  const [buildChannel, setBuildChannel] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop) return;
    getHostPort()
      .updater.getUpdaterState()
      .then((state) => setUpdaterState(hostResultOr(state, { stage: 'idle' })));
    getHostPort()
      .updater.getBuildChannel()
      .then((channel) => setBuildChannel(hostResultOr(channel, null)));
  }, []);

  useWatchBroadcast('updaterStateChanged', (state: UpdaterState) => {
    setUpdaterState(state);
  });

  const devDockGestureEnabled = import.meta.env.PROD && canAccessDevDock;

  const handleVersionClick = () => {
    if (!devDockGestureEnabled) return;

    const result = advanceDevDockClickSequence(devDockClickSequence.current, Date.now());
    devDockClickSequence.current = result.sequence;
    if (result.completed) toggleDevDockUnlocked();
  };

  const renderUpdateButton = () => {
    if (!isDesktop) {
      if (hasNewVersion && showManualUpgrade) {
        return (
          <a href={MANUAL_UPGRADE_URL} rel="noreferrer" style={{ flex: 1 }} target="_blank">
            <Button className={mobile ? 'w-full' : ''} variant="default">
              {t('upgradeVersion.action')}
            </Button>
          </a>
        );
      }
      // A failed update check must not read as "up to date" — offer a retry.
      if (updateCheckError) {
        return (
          <Button
            aria-busy={isCheckingUpdate}
            className={mobile ? 'w-full' : ''}
            disabled={isCheckingUpdate}
            variant="outline"
            onClick={() => recheckUpdate()}
          >
            {isCheckingUpdate && <Spinner />}
            {t('checkForUpdates')}
          </Button>
        );
      }
      return null;
    }

    const { stage, progress } = updaterState;

    switch (stage) {
      case 'checking': {
        return (
          <Button
            aria-busy={true}
            className={mobile ? 'w-full' : ''}
            disabled={true}
            variant="outline"
          >
            <Spinner />
            {t('checkForUpdates')}
          </Button>
        );
      }
      case 'downloading': {
        const percent = progress ? Math.round(progress.percent) : 0;
        return (
          <Button
            aria-busy={true}
            className={mobile ? 'w-full' : ''}
            disabled={true}
            variant="outline"
          >
            <Spinner />
            {t('downloadingUpdate', { percent })}
          </Button>
        );
      }
      case 'downloaded': {
        return (
          <Button
            className={mobile ? 'w-full' : ''}
            variant="default"
            onClick={() => void getHostPort().updater.installUpdateNow()}
          >
            {t('restartToUpdate')}
          </Button>
        );
      }
      case 'latest': {
        return (
          <Button disabled className={mobile ? 'w-full' : ''} variant="outline">
            {t('alreadyUpToDate')}
          </Button>
        );
      }
      default: {
        return (
          <Button
            className={mobile ? 'w-full' : ''}
            variant="outline"
            onClick={() => void getHostPort().updater.checkUpdate()}
          >
            {t('checkForUpdates')}
          </Button>
        );
      }
    }
  };

  return (
    <div
      className={'flex min-w-0'}
      style={{
        flexDirection: !mobile ? 'row' : 'column',
        alignItems: mobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: 16,
        width: '100%',
      }}
    >
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 'none' }}
      >
        <a href={OFFICIAL_SITE} rel="noreferrer" target="_blank">
          <div
            className={`flex flex-col cursor-pointer items-center h-[64px] justify-center w-[64px] ${styles.logo}`}
          >
            <ProductLogo size={52} />
          </div>
        </a>
        <div
          className={'flex min-w-0'}
          style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}
        >
          <div style={{ fontSize: 18, fontWeight: 'bolder' }}>{BRANDING_NAME}</div>
          <div
            className={'flex min-w-0'}
            style={{ flexDirection: !mobile ? 'row' : 'column', gap: 6 }}
          >
            <Badge
              style={{ cursor: devDockGestureEnabled ? 'pointer' : 'default' }}
              onClick={handleVersionClick}
            >
              v{APP_VERSION}
            </Badge>
            {buildChannel && buildChannel !== 'stable' && (
              <Badge variant="warning-light">
                {t(`setting:tab.advanced.updateChannel.${buildChannel}`, {
                  defaultValue: buildChannel.charAt(0).toUpperCase() + buildChannel.slice(1),
                })}
              </Badge>
            )}
            {showServerVersion && (
              <Badge>{t('upgradeVersion.serverVersion', { version: `v${serverVersion}` })}</Badge>
            )}
            {hasNewVersion && (
              <Badge variant="info-light">
                {t('upgradeVersion.newVersion', { version: `v${latestVersion}` })}
              </Badge>
            )}
          </div>
        </div>
      </div>
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', gap: 8, flex: mobile ? 1 : undefined }}
      >
        <a href={CHANGELOG_URL} rel="noreferrer" style={{ flex: 1 }} target="_blank">
          <Button className={mobile ? 'w-full' : ''} variant="outline">
            {t('changelog')}
          </Button>
        </a>
        {renderUpdateButton()}
      </div>
    </div>
  );
});

export default Version;
