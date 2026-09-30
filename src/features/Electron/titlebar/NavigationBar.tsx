'use client';

import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ToggleLeftPanelButton from '@/features/NavPanel/ToggleLeftPanelButton';
import {
  SHELL9_SIDEBAR_COLLAPSED_WIDTH,
  SHELL9_SIDEBAR_WIDTH,
} from '@/features/ReUIShell/constants';
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

// A persistent titlebar toggle must not share the sidebar toggle's id, or it
// would create a duplicate DOM id and get caught by NavPanelDraggable's hover CSS.
const NAV_TOGGLE_ID = 'titlebar_toggle_left_panel_button';

const navPanelSelector = (s: GlobalState) => {
  const showLeftPanel = systemStatusSelectors.showLeftPanel(s);
  return showLeftPanel ? SHELL9_SIDEBAR_WIDTH : SHELL9_SIDEBAR_COLLAPSED_WIDTH;
};

const useNavPanelWidth = () => {
  return useGlobalStore(navPanelSelector);
};

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
    <div
      className={`flex items-center gap-2 ${isMac ? 'justify-between' : 'justify-end'}`}
      data-width={leftPanelWidth}
      style={{
        paddingLeft: macTrafficLightPadding,
        paddingRight: 8,
        // The collapsed toolbar must still fit traffic lights and history controls.
        width:
          leftPanelWidth === SHELL9_SIDEBAR_WIDTH
            ? `${leftPanelWidth - 12}px`
            : isMac
              ? 'auto'
              : '150px',
      }}
    >
      {/* The persistent panel toggle is macOS-only; other platforms keep the
          in-page toggles, so the titlebar shows just the navigation controls. */}
      {isMac && (
        <div className={`flex items-center ${electronStylish.nodrag}`}>
          <ToggleLeftPanelButton forceVisible id={NAV_TOGGLE_ID} size="small" />
        </div>
      )}
      <div className={`flex items-center gap-0.5 ${electronStylish.nodrag}`}>
        <Button
          aria-label={t('navigation.back')}
          disabled={!canGoBack}
          size="icon-sm"
          variant="ghost"
          onClick={goBack}
        >
          <ArrowLeft aria-hidden />
        </Button>
        <Button
          aria-label={t('navigation.forward')}
          disabled={!canGoForward}
          size="icon-sm"
          variant="ghost"
          onClick={goForward}
        >
          <ArrowRight aria-hidden />
        </Button>
        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <TooltipProvider>
            <Tooltip open={historyOpen ? false : undefined}>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={<Button aria-label={tooltipContent} size="icon-sm" variant="ghost" />}
                  />
                }
              >
                <Clock aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{tooltipContent}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PopoverContent align="start">
            <RecentlyViewed onClose={() => setHistoryOpen(false)} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
});

NavigationBar.displayName = 'NavigationBar';

export default NavigationBar;
