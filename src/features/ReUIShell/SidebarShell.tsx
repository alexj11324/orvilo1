'use client';

import { createStaticStyles } from 'antd-style';
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
import { SHELL9_SIDEBAR_ICON_WIDTH, SHELL9_SIDEBAR_WIDTH } from './constants';

const SIDEBAR_STYLE = {
  '--header-height': '50px',
  '--sidebar-width': `${SHELL9_SIDEBAR_WIDTH}px`,
  '--sidebar-width-icon': `${SHELL9_SIDEBAR_ICON_WIDTH}px`,
};

const useNativeTransparency = isDesktop && isMacOS();
const NATIVE_SIDEBAR_STYLE = { ...SIDEBAR_STYLE, '--sidebar': 'transparent' };

// The host's unlayered Ant Design reset styles every anchor (link colour,
// transition: color 0.2s, a blue :focus-visible outline) and, being unlayered,
// beats the primitive's layered utilities. This block is the single place that hands those
// properties back to the sidebar primitive. It keys on 'data-sidebar', which the
// primitives always set, never on 'data-slot': a Base UI trigger composed around
// a node (context menu, dropdown, tooltip) may relabel its slot.
const hostStyles = createStaticStyles(({ css }) => ({
  sidebar: css`
    [data-sidebar='menu-button'],
    [data-sidebar='menu-sub-button'],
    [data-sidebar='group-label'] {
      text-decoration: none;
    }

    /* Primitive transitions only: background and text change together, instantly. */
    [data-sidebar='menu-button'] {
      overflow: hidden;
      color: var(--sidebar-muted);
      transition-property: width, height, padding;
    }

    [data-sidebar='menu-sub-button'] {
      color: var(--sidebar-group);
      transition-property: none;
    }

    [data-sidebar='group-label'] {
      font-size: var(--text-xs);
      line-height: calc(4 / 3);
      color: var(--sidebar-group);
      transition-property: margin, opacity;
    }

    /* Same as the primitive's 'outline-hidden'; the ring comes from 'ring-sidebar-ring'. */
    [data-sidebar='menu-button']:focus-visible,
    [data-sidebar='menu-sub-button']:focus-visible,
    [data-sidebar='group-label']:focus-visible {
      outline: 2px solid transparent;
      outline-offset: 2px;
    }

    [data-sidebar='menu-button'] > svg {
      opacity: 0.55;
    }

    [data-sidebar='menu-button']:hover,
    [data-sidebar='menu-sub-button']:hover,
    button[data-sidebar='group-label']:hover {
      color: var(--sidebar-accent-foreground);
      background: var(--sidebar-accent);
    }

    [data-sidebar='menu-button']:hover > svg,
    [data-sidebar='menu-button'][data-active] > svg {
      opacity: 1;
    }

    /* Selected is a persistent signal, stronger than hover; it stays on top of it. */
    [data-sidebar='menu-button'][data-active],
    [data-sidebar='menu-sub-button'][data-active] {
      color: var(--sidebar-accent-foreground);
      background: var(--selected);
    }

    /* The global thin scrollbar would otherwise keep a permanent thumb here. */
    [data-sidebar='content'] {
      scrollbar-color: transparent transparent;
    }

    [data-sidebar='content']:hover {
      scrollbar-color: color-mix(in srgb, var(--sidebar-muted) 40%, transparent) transparent;
    }
  `,
}));

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
        useNativeTransparency && '[&_[data-sidebar=sidebar]]:bg-transparent!',
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
