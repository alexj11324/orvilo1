'use client';

import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isDesktop } from '@/const/version';
import {
  getInnerCssVariables,
  getOuterCssVariables,
} from '@/features/DesktopLayoutContainer/cssVariables';
import { styles as containerStyles } from '@/features/DesktopLayoutContainer/style';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
import { electronStylish } from '@/styles/electron';

import { readBootShellGeometry } from './geometry';

// antd emits its design tokens as `.orvilo-vars{--ant-*: …}` — a plain global
// class rule, not a `:root` one. The shell renders outside `AppTheme`, so it has
// to opt into that class itself or every `var(--ant-*)` below resolves to its
// fallback.
const CSS_VAR_CLASS = 'orvilo-vars';

export const APP_SHELL_FALLBACK_ID = 'app-shell-fallback';

const HINT_DELAY = 1000;

const styles = {
  contentOverlay:
    'pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground',
  // Bottom status metadata; centering remains visible when motion is stopped.
  hint: 'absolute inset-be-6 inset-s-1/2 text-xs leading-5 whitespace-nowrap [--orvilo-boot-shell-hint-offset-x:-50%] rtl:[--orvilo-boot-shell-hint-offset-x:50%] [transform:translate(var(--orvilo-boot-shell-hint-offset-x),0)]',
  dragRegion: 'pointer-events-auto shrink-0 w-full',
  root: 'pointer-events-none fixed z-[99999] inset-0 flex flex-col',
};

/**
 * Split out so `useTranslation` runs only once the hint is due. The boot shell
 * is a sibling of `RouterProvider` and renders before the tree that initializes
 * i18n, so calling it up front would hit react-i18next with no instance —
 * a console warning and a first render that echoes the raw key.
 */
const LoadingHint = memo(() => {
  const { t } = useTranslation('common');
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);

  return (
    <div
      className={`${styles.hint} ${
        animationMode === 'disabled'
          ? ''
          : 'motion-safe:animate-[orvilo-boot-shell-hint_var(--orvilo-motion-mid,200ms)_var(--orvilo-motion-ease-out,ease-out)_both]'
      }`}
    >
      {t('stillLoading')}
    </div>
  );
});

LoadingHint.displayName = 'AppShellLoadingHint';

interface AppShellSkeletonProps {
  id?: string;
}

const AppShellSkeleton = memo<AppShellSkeletonProps>(({ id }) => {
  const { isDark, navPanelBackground, navPanelWidth, showLeftPanel } = readBootShellGeometry();
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaiting(true), HINT_DELAY);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-hidden className={`${CSS_VAR_CLASS} ${styles.root}`} id={id}>
      {isDesktop && (
        <div
          className={`${styles.dragRegion} ${electronStylish.draggable}`}
          style={{ height: TITLE_BAR_HEIGHT }}
        />
      )}
      <div
        className="flex"
        style={{
          height: isDesktop ? `calc(100% - ${TITLE_BAR_HEIGHT}px)` : '100%',
          width: '100%',
        }}
      >
        <div
          style={{
            background: navPanelBackground,
            flexShrink: 0,
            height: '100%',
            width: navPanelWidth,
          }}
        />
        <div
          className={`${containerStyles.outerContainer} flex flex-col`}
          style={{
            height: '100%',
            padding: 8,
            width: '100%',
            ...getOuterCssVariables({ expand: showLeftPanel }),
          }}
        >
          <div
            className={`${containerStyles.innerContainer} flex flex-col`}
            style={{
              height: '100%',
              width: '100%',
              ...getInnerCssVariables({ isDark }),
            }}
          >
            <div className={styles.contentOverlay}>{waiting && <LoadingHint />}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

AppShellSkeleton.displayName = 'AppShellSkeleton';

export default AppShellSkeleton;
