'use client';

import { cx } from 'antd-style';
import { type FC } from 'react';
import { Outlet } from 'react-router';

import Sidebar from './Sidebar';
import { styles } from './style';

const HomeLayout: FC = () => {
  return (
    <>
      <Sidebar />
      <div className={cx('flex flex-col flex-1 h-[100%]', styles.mainContainer)}>
        <Outlet />
      </div>
    </>
  );
};

export default HomeLayout;
