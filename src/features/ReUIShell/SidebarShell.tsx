'use client';

import { cn } from 'cn';
import { type CSSProperties, useEffect, useLayoutEffect } from 'react';

import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { isDesktop } from '@/const/version';
import { NAV_PANEL_RIGHT_DRAWER_ID } from '@/features/NavPanel/constants';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { isMacOS } from '@/utils/platform';

import { AppSidebar } from './AppSidebar';
import { SHELL9_SIDEBAR_WIDTH } from './constants';
import hostStyles from './SidebarShell.module.css';

const SIDEBAR_STYLE = {
  '--header-height': '50px',
  '--sidebar-width': `${SHELL9_SIDEBAR_WIDTH}px`,
};

const useNativeTransparency = isDesktop && isMacOS();
const NATIVE_SIDEBAR_STYLE = { ...SIDEBAR_STYLE, '--sidebar': 'transparent' };

const SIDEBAR_CLASS_TOKENS = [hostStyles.sidebar];

function useMobileBodyTheme(isMobile: boolean, sidebarStyle: typeof SIDEBAR_STYLE) {
  useEffect(() => {
    if (!isMobile) return;

    const body = document.body;
    body.classList.add(...SIDEBAR_CLASS_TOKENS);

    const previous: Record<string, string> = {};
    for (const [property, value] of Object.entries(sidebarStyle)) {
      previous[property] = body.style.getPropertyValue(property);
      body.style.setProperty(property, value);
    }

    return () => {
      body.classList.remove(...SIDEBAR_CLASS_TOKENS);
      for (const [property, previousValue] of Object.entries(previous)) {
        previousValue
          ? body.style.setProperty(property, previousValue)
          : body.style.removeProperty(property);
      }
    };
  }, [isMobile, sidebarStyle]);
}

function MobileBodyTheme({ sidebarStyle }: { sidebarStyle: typeof SIDEBAR_STYLE }) {
  const { isMobile } = useSidebar();
  useMobileBodyTheme(isMobile, sidebarStyle);

  return null;
}

export function SidebarShell() {
  const sidebarStyle = useNativeTransparency ? NATIVE_SIDEBAR_STYLE : SIDEBAR_STYLE;
  const isMobile = useIsMobile();
  const [open, drawerOpen, setOpen, setDrawerMode] = useGlobalStore((state) => [
    systemStatusSelectors.showLeftPanel(state),
    state.leftPanelDrawerOpen ?? false,
    state.toggleLeftPanel,
    state.setLeftPanelDrawerMode,
  ]);

  useLayoutEffect(() => {
    setDrawerMode(isMobile);
    return () => setDrawerMode(false);
  }, [isMobile, setDrawerMode]);

  return (
    <SidebarProvider
      open={open}
      openMobile={isMobile && drawerOpen}
      style={{ ...sidebarStyle, display: 'contents' } as CSSProperties}
      className={cn(
        hostStyles.sidebar,
        isDesktop &&
          '[&_[data-slot=sidebar-container]]:absolute [&_[data-slot=sidebar-container]]:h-full',
        useNativeTransparency && hostStyles.nativeTransparent,
      )}
      onOpenChange={setOpen}
      onOpenMobileChange={setOpen}
    >
      <AppSidebar />
      <div
        id={NAV_PANEL_RIGHT_DRAWER_ID}
        style={{ height: '100%', position: 'relative', width: 0, zIndex: 10 }}
      />
      <MobileBodyTheme sidebarStyle={sidebarStyle} />
    </SidebarProvider>
  );
}
