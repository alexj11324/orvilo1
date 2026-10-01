'use client';

import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { useTheme } from 'next-themes';
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
  '--sidebar': 'var(--color-zinc-900)',
  '--sidebar-accent': 'var(--color-zinc-800)',
  '--sidebar-accent-foreground': 'var(--color-zinc-100)',
  '--sidebar-border': 'color-mix(in oklab, var(--color-zinc-700) 52%, transparent)',
  '--sidebar-foreground': 'var(--color-zinc-100)',
  '--sidebar-primary': 'var(--color-zinc-100)',
  '--sidebar-primary-foreground': 'var(--color-zinc-900)',
  '--sidebar-ring': 'var(--color-zinc-400)',
  '--sidebar-muted': 'var(--color-zinc-300)',
  '--sidebar-group': 'var(--color-zinc-400)',
  '--sidebar-width': `${SHELL9_SIDEBAR_WIDTH}px`,
  '--sidebar-width-icon': `${SHELL9_SIDEBAR_ICON_WIDTH}px`,
};

const useNativeTransparency = isDesktop && isMacOS();
const DARK_NATIVE_SIDEBAR_STYLE = { ...SIDEBAR_STYLE, '--sidebar': 'transparent' };
const LIGHT_SIDEBAR_STYLE = {
  ...SIDEBAR_STYLE,
  '--sidebar': 'transparent',
  '--sidebar-accent': 'color-mix(in oklab, var(--color-zinc-300) 60%, transparent)',
  '--sidebar-accent-foreground': 'var(--color-zinc-950)',
  '--sidebar-border': 'color-mix(in oklab, var(--color-zinc-400) 45%, transparent)',
  '--sidebar-foreground': 'var(--color-zinc-900)',
  '--sidebar-primary': 'var(--color-zinc-900)',
  '--sidebar-primary-foreground': 'var(--color-zinc-50)',
  '--sidebar-muted': 'var(--color-zinc-700)',
  '--sidebar-group': 'var(--color-zinc-600)',
};
// Solid-background variant of the light palette for platforms without
// macOS vibrancy (web, non-Mac desktop, mobile).
const LIGHT_SOLID_SIDEBAR_STYLE = { ...LIGHT_SIDEBAR_STYLE, '--sidebar': 'var(--color-zinc-100)' };

// The host's unlayered Ant Design link/reset rules otherwise override the source utilities.
const hostStyles = createStaticStyles(({ css }) => ({
  sidebar: css`
    [data-sidebar='menu-button'] {
      overflow: hidden;
      color: var(--sidebar-muted);
    }

    [data-sidebar='menu-button'] > svg {
      opacity: 0.55;
    }

    [data-sidebar='menu-button']:hover {
      color: var(--sidebar-accent-foreground);
      background: var(--sidebar-accent);
    }

    [data-sidebar='menu-button']:hover > svg,
    [data-sidebar='menu-button'][data-active] > svg {
      opacity: 1;
    }

    [data-sidebar='menu-button'][data-active] {
      color: var(--sidebar-accent-foreground);
      background: var(--sidebar-accent);
    }

    [data-slot='sidebar-menu-sub-button'] {
      color: var(--sidebar-group);
    }

    [data-slot='sidebar-menu-sub-button']:hover {
      color: var(--sidebar-accent-foreground);
      background: var(--sidebar-accent);
    }

    [data-slot='sidebar-menu-sub-button'][data-active] {
      color: var(--sidebar-accent-foreground);
      background: var(--sidebar-accent);
    }

    [data-slot='sidebar-group-label'] {
      font-size: var(--text-xs);
      line-height: calc(4 / 3);
      color: var(--sidebar-group);
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
  const { resolvedTheme } = useTheme();
  const sidebarStyle = useNativeTransparency
    ? resolvedTheme === 'light'
      ? LIGHT_SIDEBAR_STYLE
      : DARK_NATIVE_SIDEBAR_STYLE
    : resolvedTheme === 'light'
      ? LIGHT_SOLID_SIDEBAR_STYLE
      : SIDEBAR_STYLE;
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
