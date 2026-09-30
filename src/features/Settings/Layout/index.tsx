'use client';

import { type FC } from 'react';
import { Outlet } from 'react-router';

import SideBar from '@/features/Settings/Layout/SideBar';
import { RouteSkeletonChromeProvider } from '@/spa/router/routeSkeletonChrome';

import SettingsContextProvider from './ContextProvider';
import { styles } from './style';

const Layout: FC = () => {
  return (
    <SettingsContextProvider
      value={{
        showOpenAIApiKey: true,
        showOpenAIProxyUrl: true,
      }}
    >
      <SideBar />
      <div className={`flex flex-col flex-1 h-full ${styles.mainContainer}`}>
        <RouteSkeletonChromeProvider>
          <Outlet />
        </RouteSkeletonChromeProvider>
      </div>
    </SettingsContextProvider>
  );
};

export default Layout;
