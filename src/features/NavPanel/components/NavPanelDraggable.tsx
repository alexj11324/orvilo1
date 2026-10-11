'use client';

import { DraggablePanel } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { type ReactNode } from 'react';
import { Activity, memo, Suspense, useMemo, useRef } from 'react';

import NavPanelUpgradeEntry from '@/business/client/features/NavPanelUpgradeEntry';
import { isDesktop } from '@/const/version';
import Footer from '@/features/HomeSidebar/Footer';
import { USER_DROPDOWN_ICON_ID } from '@/features/NavPanel/constants';
import { useGlobalStore } from '@/store/global';
import {
  NAV_PANEL_MAX_WIDTH,
  NAV_PANEL_MIN_WIDTH,
  systemStatusSelectors,
} from '@/store/global/selectors';
import { isMacOS } from '@/utils/platform';

import { useNavPanelSizeChangeHandler } from '../hooks/useNavPanel';
import { BACK_BUTTON_ID } from './BackButton';

const draggableStyles = createStaticStyles(({ css, cssVar }) => ({
  panel: css`
    user-select: none;
    height: 100%;
    color: ${cssVar.colorTextSecondary};
    background: ${isDesktop && isMacOS() ? 'transparent' : cssVar.colorBgLayout};

    * {
      user-select: none;
    }

    #${USER_DROPDOWN_ICON_ID} {
      width: 0 !important;
      opacity: 0;
      transition:
        opacity,
        width 0.2s ${cssVar.motionEaseOut};
    }
    #${BACK_BUTTON_ID} {
      width: 24px !important;
    }

    &:hover {
      #${USER_DROPDOWN_ICON_ID} {
        width: 14px !important;
        opacity: 1;
      }
    }
  `,
}));

const twDraggableStyles = {
  content: 'relative flex h-full min-h-full max-h-full flex-col overflow-hidden',
  inner: 'relative min-h-0 min-w-60 max-w-full flex-1 overflow-hidden',
  layer: 'absolute inset-0 min-h-full max-h-full min-w-60 max-w-full flex-col overflow-hidden',
};

interface NavPanelDraggableProps {
  activeContent: {
    key: string;
    node: ReactNode;
  };
  homeContent?: ReactNode;
}

const classNames = {
  content: twDraggableStyles.content,
};

export const NavPanelDraggable = memo<NavPanelDraggableProps>(({ activeContent, homeContent }) => {
  const isStatusInit = useGlobalStore(systemStatusSelectors.isStatusInit);
  const handleSizeChange = useNavPanelSizeChangeHandler();

  // Defer DraggablePanel mount until system status hydrates; otherwise defaultSize
  // captures the pre-hydration default and the DOM drifts off NavigationBar's live width.
  const defaultWidthRef = useRef(0);
  if (defaultWidthRef.current === 0 && isStatusInit) {
    defaultWidthRef.current = systemStatusSelectors.leftPanelWidth(useGlobalStore.getState());
  }

  const styles = useMemo(
    () => ({
      background: isDesktop && isMacOS() ? 'transparent' : cssVar.colorBgLayout,
      zIndex: 11,
    }),
    [],
  );

  if (defaultWidthRef.current === 0) {
    const pendingWidth = systemStatusSelectors.leftPanelWidth(useGlobalStore.getState());
    return <div aria-hidden className="h-full shrink-0" style={{ width: pendingWidth }} />;
  }

  const defaultSize = { height: '100%', width: defaultWidthRef.current };
  const isHomeActive = activeContent.key === 'home';

  return (
    <DraggablePanel
      expand
      className={draggableStyles.panel}
      classNames={classNames}
      defaultSize={defaultSize}
      expandable={false}
      maxWidth={NAV_PANEL_MAX_WIDTH}
      minWidth={NAV_PANEL_MIN_WIDTH}
      placement="left"
      showBorder={false}
      style={styles}
      onSizeDragging={handleSizeChange}
    >
      <div className={twDraggableStyles.inner}>
        {/* Home stays mounted while a route-owned panel is active so its list
            state survives the round trip. Activity keeps the fibers but not the
            visibility, so the layer is force-hidden like HomeLayout does. */}
        {homeContent && (
          <Activity mode={isHomeActive ? 'visible' : 'hidden'} name="NavPanelHome">
            <div className={`${twDraggableStyles.layer} ${isHomeActive ? 'flex' : 'hidden'}`}>
              {homeContent}
            </div>
          </Activity>
        )}
        {!isHomeActive && (
          <div className={`${twDraggableStyles.layer} flex`} key={activeContent.key}>
            {activeContent.node}
          </div>
        )}
      </div>
      <Suspense fallback={null}>
        <NavPanelUpgradeEntry />
      </Suspense>
      <Suspense>
        <Footer />
      </Suspense>
    </DraggablePanel>
  );
});
