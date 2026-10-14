'use client';

import { cn } from 'cn';
import { type FC } from 'react';
import { Outlet } from 'react-router';

import { RouteSkeletonChromeProvider } from '@/spa/router/routeSkeletonChrome';

import Sidebar from './Sidebar';
import { styles } from './style';

const DesktopMemoryLayout: FC = () => {
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
