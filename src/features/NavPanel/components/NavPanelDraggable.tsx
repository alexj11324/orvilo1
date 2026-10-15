'use client';

import { DraggablePanel } from '@lobehub/ui/base-ui';
import { cn } from 'cn';
import { type ReactNode } from 'react';
import { Activity, memo, Suspense, useMemo, useRef } from 'react';

import NavPanelUpgradeEntry from '@/business/client/features/NavPanelUpgradeEntry';
import { isDesktop } from '@/const/version';
import Footer from '@/features/HomeSidebar/Footer';
import { useGlobalStore } from '@/store/global';
import {
  NAV_PANEL_MAX_WIDTH,
  NAV_PANEL_MIN_WIDTH,
  systemStatusSelectors,
} from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { isMacOS } from '@/utils/platform';

import { useNavPanelSizeChangeHandler } from '../hooks/useNavPanel';

// Literal descendant IDs are visible to Tailwind's scanner. The existing User
// chevron is an SVG presentation-width attribute, so native CSS can control it;
// BackButton uses its public 24/16 size contract instead of a forced width.
const twDraggableStyles = {
  panel:
    'h-full select-none text-muted-foreground [&_*]:select-none [&_#user-dropdown-icon]:w-0 [&_#user-dropdown-icon]:opacity-0 hover:[&_#user-dropdown-icon]:w-4 hover:[&_#user-dropdown-icon]:opacity-100',
  chevronMotion:
    '[&_#user-dropdown-icon]:transition-[opacity,width] [&_#user-dropdown-icon]:duration-(--orvilo-motion-mid) [&_#user-dropdown-icon]:ease-(--orvilo-motion-ease-out) motion-reduce:[&_#user-dropdown-icon]:transition-none',
  chevronStatic: '[&_#user-dropdown-icon]:transition-none',
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
  // A descendant transition utility is emitted on the SVG, not the root that
  // carries its class string. Stop it explicitly for the live user preference.
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const handleSizeChange = useNavPanelSizeChangeHandler();

  // Defer DraggablePanel mount until system status hydrates; otherwise defaultSize
  // captures the pre-hydration default and the DOM drifts off NavigationBar's live width.
  const defaultWidthRef = useRef(0);
  if (defaultWidthRef.current === 0 && isStatusInit) {
    defaultWidthRef.current = systemStatusSelectors.leftPanelWidth(useGlobalStore.getState());
  }

  const styles = useMemo(
    () => ({
      background: isDesktop && isMacOS() ? 'transparent' : 'var(--background)',
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
      classNames={classNames}
      defaultSize={defaultSize}
      expandable={false}
      maxWidth={NAV_PANEL_MAX_WIDTH}
      minWidth={NAV_PANEL_MIN_WIDTH}
      placement="left"
      showBorder={false}
      style={styles}
      className={cn(
        twDraggableStyles.panel,
        isDesktop && isMacOS() ? 'bg-transparent' : 'bg-background',
        animationMode === 'disabled'
          ? twDraggableStyles.chevronStatic
          : twDraggableStyles.chevronMotion,
      )}
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
