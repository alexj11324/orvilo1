'use client';

import { HotkeyScopeEnum } from '@orvilo/const/hotkeys';
import { cx } from 'antd-style';
import { cn } from 'cn';
import { type FC } from 'react';
import { Suspense } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { Outlet } from 'react-router';

import WorkspaceContextSlot from '@/business/client/WorkspaceContextSlot';
import RouteSegmentSkeleton from '@/components/Skeleton/RouteSegment';
import { isDesktop } from '@/const/version';
import AgentOnboarding from '@/features/AgentOnboarding';
import FirstLoginGate from '@/features/AgentOnboarding/FirstLoginGate';
import { BANNER_HEIGHT } from '@/features/AlertBanner/CloudBanner';
import DesktopLayoutContainer from '@/features/DesktopLayoutContainer';
import GlobalOverlays from '@/features/GlobalOverlays';
import { GlobalOverlayHostContext } from '@/features/GlobalOverlays/globalHostContext';
import HotkeyHelperPanel from '@/features/HotkeyHelperPanel';
import { DndContextWrapper } from '@/features/ResourceManager/DndContextWrapper';
import { SidebarShell } from '@/features/ReUIShell/SidebarShell';
import { RouteMetaBridge } from '@/features/RouteMeta';
import { usePlatform } from '@/hooks/usePlatform';
import CmdkLazy from '@/layout/GlobalProvider/CmdkLazy';
import dynamic from '@/libs/next/dynamic';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import DesktopAutoOidcOnFirstOpen from './DesktopAutoOidcOnFirstOpen';
import RegisterHotkeys from './RegisterHotkeys';
import { styles } from './style';

const CloudBanner = dynamic(() => import('@/features/AlertBanner/CloudBanner'));
const GlobalApprovalNotification = dynamic(() => import('@/features/GlobalApprovalNotification'));

// The Electron shell (title bar, tab bridges, overlays, zoom HUD) lives in
// index.desktop.tsx; only the first-open OIDC boot hook stays here so a
// desktop build that falls back to this layout can still auto-connect. The
// session-auth recovery adapters moved up to SPAGlobalProvider so every route
// (including the top-level /onboarding) has a subscriber.
const Layout: FC = () => {
  const { isPWA } = usePlatform();
  const { showCloudPromotion } = useServerConfigStore(featureFlagsSelectors);
  // URL is the source of truth for workspace context — keep the selection
  // store aligned with the route before any workspace surface paints.

  // The provider wraps the whole tree — the `<Outlet/>` subtree that resolves to
  // the pages *and* the `<GlobalOverlays/>` host below it. Panels declared on a
  // page can then see that this tree already has a host and stand down, so one
  // open topic renders exactly one panel.
  return (
    <GlobalOverlayHostContext value={true}>
      <HotkeysProvider initiallyActiveScopes={[HotkeyScopeEnum.Global]}>
        {isDesktop && <DesktopAutoOidcOnFirstOpen />}
        <FirstLoginGate>
          <WorkspaceContextSlot>
            {/* Until the first usable agent exists the gate covers the whole
                window — nothing else can run yet, so no page or sidebar entry
                may be reachable mid-setup. */}
            <AgentOnboarding>
              <RouteMetaBridge />
              <Suspense fallback={null}>{showCloudPromotion && <CloudBanner />}</Suspense>
              <DndContextWrapper>
                <div
                  className={cn('flex', cx(isPWA ? styles.mainContainerPWA : styles.mainContainer))}
                  style={{
                    height: showCloudPromotion ? `calc(100% - ${BANNER_HEIGHT}px)` : '100%',
                    width: '100%',
                  }}
                >
                  <SidebarShell />
                  <DesktopLayoutContainer>
                    <Suspense fallback={<RouteSegmentSkeleton />}>
                      <Outlet />
                    </Suspense>
                  </DesktopLayoutContainer>
                </div>
              </DndContextWrapper>
              <Suspense fallback={null}>
                <HotkeyHelperPanel />
                <RegisterHotkeys />
                <CmdkLazy />
                <GlobalApprovalNotification />
                <GlobalOverlays />
              </Suspense>
            </AgentOnboarding>
          </WorkspaceContextSlot>
        </FirstLoginGate>
      </HotkeysProvider>
    </GlobalOverlayHostContext>
  );
};

export default Layout;
