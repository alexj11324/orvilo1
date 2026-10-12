'use client';

import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { cn } from 'cn';
import { memo } from 'react';

import { useWatchThemeUpdate } from '@/features/Electron/system/useWatchThemeUpdate';
import { WINDOWS_NATIVE_CONTROL_WIDTH } from '@/features/Electron/titlebar/layout';
import WinControl from '@/features/Electron/titlebar/WinControl';
import { electronStylish } from '@/styles/electron';
import { getPlatform, isMacOS } from '@/utils/platform';

import PinOnTopButton from './PinOnTopButton';

// Reserve space for macOS traffic lights when titleBarStyle is hidden.
const MAC_TRAFFIC_LIGHT_WIDTH = 80;

const styles = {
  container: 'select-none border-be border-divider bg-background',
  title:
    'overflow-hidden text-xs leading-5 text-muted-foreground text-center text-ellipsis whitespace-nowrap',
};

interface PopupTitleBarProps {
  title?: string;
}

const PopupTitleBar = memo<PopupTitleBarProps>(({ title }) => {
  useWatchThemeUpdate();

  const platform = getPlatform();
  const isMac = isMacOS();
  const isLinux = platform === 'Linux';
  const isWindows = platform === 'Windows';
  const showWinControl = !isMac && isLinux;
  const leftSpacer = isMac ? MAC_TRAFFIC_LIGHT_WIDTH : 0;
  const rightSpacer = isWindows ? WINDOWS_NATIVE_CONTROL_WIDTH : 0;

  return (
    <div
      className={cn(
        'flex items-center flex-none gap-1 w-full px-2',
        styles.container,
        electronStylish.draggable,
      )}
      style={{
        height: TITLE_BAR_HEIGHT,
        minHeight: TITLE_BAR_HEIGHT,
      }}
    >
      <div style={{ flex: `0 0 ${leftSpacer}px` }} />
      <div className="flex flex-col flex-1 min-w-0">
        {title && <div className={styles.title}>{title}</div>}
      </div>
      <PinOnTopButton />
      {showWinControl ? <WinControl /> : <div style={{ flex: `0 0 ${rightSpacer}px` }} />}
    </div>
  );
});

PopupTitleBar.displayName = 'PopupTitleBar';

export default PopupTitleBar;
