'use client';

import { Flexbox } from '@lobehub/ui';
import { HotkeyScopeEnum } from '@orvilo/const/hotkeys';
import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { cx } from 'antd-style';
import { type CSSProperties, type FC } from 'react';
import { Suspense } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';

import WorkspaceContextSlot from '@/business/client/WorkspaceContextSlot';
import DesktopFileMenuBridge from '@/features/DesktopFileMenuBridge';
import DesktopLayoutContainer from '@/features/DesktopLayoutContainer';
import DesktopNavigationBridge from '@/features/DesktopNavigationBridge';
import ActiveConversationBridge from '@/features/Electron/ActiveConversationBridge';
import OverlayCaptureUploader from '@/features/Electron/ScreenCapture/OverlayCaptureUploader';
import OverlayMessageDispatcher from '@/features/Electron/ScreenCapture/OverlayMessageDispatcher';
import OverlaySnapshotPublisher from '@/features/Electron/ScreenCapture/OverlaySnapshotPublisher';
import {
  useDesktopDocumentTitle,
  useLastWorkspaceSlugSync,
  useWindowUrlMirror,
} from '@/features/Electron/shell';
import ZoomHUD from '@/features/Electron/system/ZoomHUD';
import { TabHost, useSeedTabsOnBoot } from '@/features/Electron/TabHost';
import TabCacheBridges from '@/features/Electron/titlebar/TabBar/TabCacheBridges';
import TitleBar from '@/features/Electron/titlebar/TitleBar';
import GlobalOverlays from '@/features/GlobalOverlays';
import { GlobalOverlayHostContext } from '@/features/GlobalOverlays/globalHostContext';
import HotkeyHelperPanel from '@/features/HotkeyHelperPanel';
import NavPanelShell from '@/features/NavPanel/Shell';
import { DndContextWrapper } from '@/features/ResourceManager/DndContextWrapper';
import { usePlatform } from '@/hooks/usePlatform';
import CmdkLazy from '@/layout/GlobalProvider/CmdkLazy';
import dynamic from '@/libs/next/dynamic';
import { featureFlagsSelectors, useServerConfigStore } from '@/store/serverConfig';

import DesktopAutoOidcOnFirstOpen from './DesktopAutoOidcOnFirstOpen';
import RegisterHotkeys from './RegisterHotkeys';
import { styles } from './style';

const CloudBanner = dynamic(() => import('@/features/AlertBanner/CloudBanner'));
const GlobalApprovalNotification = dynamic(() => import('@/features/GlobalApprovalNotification'));

const tabHostContainer: CSSProperties = { position: 'relative' };

const Layout: FC = () => {
  const { isPWA } = usePlatform();
  const { showCloudPromotion } = useServerConfigStore(featureFlagsSelectors);

  useSeedTabsOnBoot();
  useWindowUrlMirror();
  useLastWorkspaceSlugSync();
  useDesktopDocumentTitle();

  // The provider wraps the whole tree — the `<TabHost/>` subtree that resolves
  // each tab's page *and* the `<GlobalOverlays/>` host below it. Panels declared
  // on a tab's page can then see that this tree already has a host and stand
  // down, so one open topic renders exactly one panel.
  return (
    <GlobalOverlayHostContext value={true}>
      <HotkeysProvider initiallyActiveScopes={[HotkeyScopeEnum.Global]}>
        <DesktopAutoOidcOnFirstOpen />
        <WorkspaceContextSlot>
          <ActiveConversationBridge />
          <TabCacheBridges />
          <Suspense fallback={null}>
            <DesktopNavigationBridge />
            <DesktopFileMenuBridge />
            <OverlaySnapshotPublisher />
            <OverlayCaptureUploader />
            <OverlayMessageDispatcher />
            {showCloudPromotion && <CloudBanner />}
          </Suspense>
          <ZoomHUD />

          <Suspense fallback={null}>
            <TitleBar />
          </Suspense>
          <DndContextWrapper>
            <Flexbox
              horizontal
              className={cx(isPWA ? styles.mainContainerPWA : styles.mainContainer)}
              height={`calc(100% - ${TITLE_BAR_HEIGHT}px)`}
              width={'100%'}
            >
              <NavPanelShell />
              <DesktopLayoutContainer>
                <Flexbox height={'100%'} style={tabHostContainer} width={'100%'}>
                  <TabHost />
                </Flexbox>
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
