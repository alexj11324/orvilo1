import { TITLE_BAR_HEIGHT } from '@orvilo/desktop-bridge';
import { Divider } from 'antd';
import { cx } from 'antd-style';
import { memo } from 'react';

import { useDeferredMount } from '@/hooks/useDeferredMount';
import { electronStylish } from '@/styles/electron';
import { getPlatform } from '@/utils/platform';

import Connection from '../connection/Connection';
import DeviceGateway from '../connection/DeviceGateway';
import { useWatchThemeUpdate } from '../system/useWatchThemeUpdate';
import { UpdateNotification } from '../updater/UpdateNotification';
import { getTitleBarLayoutConfig } from './layout';
import NavigationBar from './NavigationBar';
import TabBar from './TabBar';
import WinControl from './WinControl';

const platform = getPlatform();

const TitleBar = memo(() => {
  useWatchThemeUpdate();
  const tabBarMounted = useDeferredMount();

  const { padding, showCustomWinControl } = getTitleBarLayoutConfig(platform);

  return (
    <div
      className={cx(electronStylish.draggable, 'flex items-center justify-between w-full')}
      style={{ height: TITLE_BAR_HEIGHT, minHeight: TITLE_BAR_HEIGHT, padding }}
    >
      <NavigationBar />
      {tabBarMounted && <TabBar />}

      <div className="flex items-center gap-1">
        <div className={cx(electronStylish.nodrag, 'flex gap-2')}>
          <UpdateNotification />
          <DeviceGateway />
          <Connection />
        </div>
        {showCustomWinControl && (
          <>
            <Divider orientation={'vertical'} />
            <WinControl />
          </>
        )}
      </div>
    </div>
  );
});

export default TitleBar;
