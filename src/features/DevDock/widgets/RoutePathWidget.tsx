'use client';

import { memo } from 'react';
import { useLocation } from 'react-router';

import { isDesktop } from '@/const/version';
import { selectActiveTabUrl } from '@/features/Electron/shell/activeTabUrl';
import { useElectronStore } from '@/store/electron';

import { readableRoutePath } from './routePathDisplay';

const styles = {
  path: 'block max-w-full truncate font-mono text-xs leading-5 text-foreground-tertiary',
};

const RoutePathWidget = memo(() => {
  const { pathname } = useLocation();
  const activeTabUrl = useElectronStore(selectActiveTabUrl);

  // The DevDock renders inside the root router, which Electron freezes at the boot
  // url; the page actually on screen belongs to the active tab's per-tab router.
  const path = readableRoutePath((isDesktop && activeTabUrl) || pathname);

  return (
    <span className={styles.path} title={path}>
      {path}
    </span>
  );
});

RoutePathWidget.displayName = 'DevDockRoutePathWidget';

export default RoutePathWidget;
