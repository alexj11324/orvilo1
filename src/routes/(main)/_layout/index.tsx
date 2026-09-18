'use client';

import { Flexbox } from '@lobehub/ui';
import { HotkeyScopeEnum } from '@orvilo/const/hotkeys';
import { cx } from 'antd-style';
import { type FC } from 'react';
import { Suspense } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { Outlet } from 'react-router';

import WorkspaceContextSlot from '@/business/client/WorkspaceContextSlot';
import RouteSegmentSkeleton from '@/components/Skeleton/RouteSegment';
import { isDesktop } from '@/const/version';
import { BANNER_HEIGHT } from '@/features/AlertBanner/CloudBanner';
import DesktopLayoutContainer from '@/features/DesktopLayoutContainer';
import AuthRequiredModal from '@/features/Electron/AuthRequiredModal';
import GlobalOverlays from '@/features/GlobalOverlays';
import { GlobalOverlayHostContext } from '@/features/GlobalOverlays/globalHostContext';
import HotkeyHelperPanel from '@/features/HotkeyHelperPanel';
import NavPanelShell from '@/features/NavPanel/Shell';
import { DndContextWrapper } from '@/features/ResourceManager/DndContextWrapper';
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
// index.desktop.tsx; only the auth recovery pair stays here so a desktop build
// that falls back to this layout can still re-login.
const Layout: FC = () => {
  const { isPWA } = usePlatform();
  const { showCloudPromotion } = useServerConfigStore(featureFlagsSelectors);

  // The provider wraps the whole tree — the `<Outlet/>` subtree that resolves to
  // the pages *and* the `<GlobalOverlays/>` host below it. Panels declared on a
  // page can then see that this tree already has a host and stand down, so one
  // open topic renders exactly one panel.
  return (
    <GlobalOverlayHostContext value={true}>
      <HotkeysProvider initiallyActiveScopes={[HotkeyScopeEnum.Global]}>
        {isDesktop && <DesktopAutoOidcOnFirstOpen />}
        {isDesktop && <AuthRequiredModal />}
        <WorkspaceContextSlot>
          <RouteMetaBridge />
          <Suspense fallback={null}>{showCloudPromotion && <CloudBanner />}</Suspense>
          <DndContextWrapper>
            <Flexbox
              horizontal
              className={cx(isPWA ? styles.mainContainerPWA : styles.mainContainer)}
              height={showCloudPromotion ? `calc(100% - ${BANNER_HEIGHT}px)` : '100%'}
              width={'100%'}
            >
              <NavPanelShell />
              <DesktopLayoutContainer>
                <Suspense fallback={<RouteSegmentSkeleton />}>
                  <Outlet />
                </Suspense>
              </DesktopLayoutContainer>
            </Flexbox>
          </DndContextWrapper>
          <Suspense fallback={null}>
            <HotkeyHelperPanel />
            <RegisterHotkeys />
            <CmdkLazy />
            <GlobalApprovalNotification />
            <GlobalOverlays />
          </Suspense>
        </WorkspaceContextSlot>
      </HotkeysProvider>
    </GlobalOverlayHostContext>
  );
};

export default Layout;
