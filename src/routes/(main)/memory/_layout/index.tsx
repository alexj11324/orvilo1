'use client';

import { cn } from 'cn';
import { type FC } from 'react';
import { Outlet } from 'react-router';

import NotFound from '@/components/404';
import { isSettingsTabAvailable } from '@/config/routes/settings';
import { useSettingsCapabilityContext } from '@/features/Settings/hooks/useSettingsCapability';
import { RouteSkeletonChromeProvider } from '@/spa/router/routeSkeletonChrome';
import { SettingsTabs } from '@/store/global/initialState';

import Sidebar from './Sidebar';
import { styles } from './style';

const DesktopMemoryLayout: FC = () => {
  const capabilityContext = useSettingsCapabilityContext();
  if (!isSettingsTabAvailable(SettingsTabs.Memory, capabilityContext)) return <NotFound />;

  return (
    <>
      <Sidebar />
      <div className={cn('flex flex-col flex-1', styles.mainContainer)} style={{ height: '100%' }}>
        <RouteSkeletonChromeProvider>
          <Outlet />
        </RouteSkeletonChromeProvider>
      </div>
    </>
  );
};

export default DesktopMemoryLayout;
