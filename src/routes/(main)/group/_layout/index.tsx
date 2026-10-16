import { cn } from 'cn';
import { type FC } from 'react';
import { Outlet } from 'react-router';

import { GroupNotFoundGuard } from '@/features/GroupNotFound';
import { useInitGroupConfig } from '@/hooks/useInitGroupConfig';

import GroupIdSync from './GroupIdSync';
import RegisterHotkeys from './RegisterHotkeys';
import Sidebar from './Sidebar';
import { styles } from './style';

const Layout: FC = () => {
  useInitGroupConfig();

  return (
    <>
      <Sidebar />
      <div className={cn('flex flex-col flex-1', styles.mainContainer)} style={{ height: '100%' }}>
        {/* Keep the sidebar interactive when the routed group is gone (deleted
            or made private) — only the content area collapses to the 404 card. */}
        <GroupNotFoundGuard>
          <Outlet />
        </GroupNotFoundGuard>
      </div>
      <RegisterHotkeys />
      <GroupIdSync />
    </>
  );
};

export default Layout;
