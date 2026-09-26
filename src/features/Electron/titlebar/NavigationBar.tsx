'use client';

import { Flexbox, Popover, Tooltip } from '@lobehub/ui';
import { ActionIcon } from '@lobehub/ui/base-ui';
import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { createStaticStyles } from 'antd-style';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { electronSystemService } from '@/services/electron/system';
import { useElectronStore } from '@/store/electron';
import { useGlobalStore } from '@/store/global';
import type { GlobalState } from '@/store/global/initialState';
import { systemStatusSelectors } from '@/store/global/selectors';
import { getHomeStoreState } from '@/store/home';
import { electronStylish } from '@/styles/electron';
import { isMacOS } from '@/utils/platform';

import { useNavigationHistory } from '../navigation/useNavigationHistory';
import { getMacTrafficLightPadding } from './layout';
import RecentlyViewed from './RecentlyViewed';
import { useTrayMenuSync } from './TrayMenu/useTrayMenuSync';

const isMac = isMacOS();

const navPanelSelector = (s: GlobalState) => systemStatusSelectors.leftPanelWidth(s);

const useNavPanelWidth = () => {
  return useGlobalStore(navPanelSelector);
};

const styles = createStaticStyles(({ css, cssVar }) => ({
  clock: css`
    &[data-popup-open] {
      border-radius: ${cssVar.borderRadiusSM};
      background-color: ${cssVar.colorFillTertiary};
    }
  `,
}));

const NavigationBar = memo(() => {
  useTrayMenuSync();
  const { t } = useTranslation('electron');
  const navigate = useWorkspaceAwareNavigate();
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isWindowFullScreen, setIsWindowFullScreen] = useState(false);
  const activeRecentScope = useElectronStore((state) => state.activeRecentScope);

  const leftPanelWidth = useNavPanelWidth();

  useWatchBroadcast('windowFullscreenChanged', ({ isFullScreen }) => {
    if (isMac) setIsWindowFullScreen(isFullScreen);
  });

  useWatchBroadcast('openRecentlyViewed', () => setHistoryOpen(true));

  useWatchBroadcast('openAllAgents', () => {
    const homePath = activeRecentScope.type === 'workspace' ? `/${activeRecentScope.slug}` : '/';
    navigate(homePath, { escape: true });
    getHomeStoreState().openAllAgentsDrawer();
  });

  useEffect(() => {
    if (!isMac) return;

    let disposed = false;

    const syncFullScreenState = async () => {
      try {
        const isFullScreen = await electronSystemService.isWindowFullScreen();
        if (!disposed) setIsWindowFullScreen(isFullScreen);
      } catch {
        if (!disposed) setIsWindowFullScreen(false);
      }
    };

    void syncFullScreenState();

    return () => {
      disposed = true;
    };
  }, []);

  // Toggle history popover
  const toggleHistoryOpen = useCallback(() => {
    setHistoryOpen((prev) => !prev);
  }, []);

  // Listen for keyboard shortcut ⌘Y / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
      if (isCmdOrCtrl && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        toggleHistoryOpen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleHistoryOpen]);

  // Tooltip content for the clock button
  const tooltipContent = t('navigation.recentView');

  const macTrafficLightPadding = getMacTrafficLightPadding(isMac, isWindowFullScreen);

  return (
    <Flexbox
      horizontal
      align="center"
      data-width={leftPanelWidth}
      gap={8}
      justify="end"
      style={{
        paddingLeft: macTrafficLightPadding,
        paddingRight: 8,
        width: `${leftPanelWidth - 12}px`,
      }}
    >
      <Flexbox horizontal align="center" className={electronStylish.nodrag} gap={2}>
        <ActionIcon disabled={!canGoBack} icon={ArrowLeft} size="small" onClick={goBack} />
        <ActionIcon disabled={!canGoForward} icon={ArrowRight} size="small" onClick={goForward} />
        <Popover
          content={<RecentlyViewed onClose={() => setHistoryOpen(false)} />}
          open={historyOpen}
          placement="bottomLeft"
          styles={{ content: { padding: 0 } }}
          trigger="click"
          onOpenChange={setHistoryOpen}
        >
          <div className={styles.clock}>
            <Tooltip open={historyOpen ? false : undefined} title={tooltipContent}>
              <ActionIcon icon={Clock} size="small" />
            </Tooltip>
          </div>
        </Popover>
      </Flexbox>
    </Flexbox>
  );
});

NavigationBar.displayName = 'NavigationBar';

export default NavigationBar;
