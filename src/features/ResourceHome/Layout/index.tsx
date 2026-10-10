'use client';

import { cn } from 'cn';
import { type FC } from 'react';
import { Outlet } from 'react-router';

import Sidebar from './Sidebar';
import { styles } from './style';

const HomeLayout: FC = () => {
  return (
    <>
      <Sidebar />
      <div className={cn('flex flex-col flex-1 h-[100%]', styles.mainContainer)}>
        <Outlet />
      </div>
    </>
  );
};

export default HomeLayout;
