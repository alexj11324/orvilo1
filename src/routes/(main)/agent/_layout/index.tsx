import { cn } from 'cn';
import { type FC } from 'react';
import { Outlet } from 'react-router';

import { isDesktop } from '@/const/version';
import { AgentNotFoundGuard } from '@/features/AgentNotFound';
import AgentSidebar from '@/features/AgentSidebar';
import ProtocolUrlHandler from '@/features/ProtocolUrlHandler';
import AgentIdSync from '@/routes/(main)/agent/_layout/AgentIdSync';

import RegisterHotkeys from './RegisterHotkeys';
import { styles } from './style';

const Layout: FC = () => {
  return (
    <>
      <AgentSidebar />
      <div className={cn('flex flex-col flex-1', styles.mainContainer)} style={{ height: '100%' }}>
        {/* Keep the sidebar interactive when the routed agent is gone (deleted
            or made private) — only the content area collapses to the 404 card. */}
        <AgentNotFoundGuard>
          <Outlet />
        </AgentNotFoundGuard>
      </div>
      <RegisterHotkeys />
      {isDesktop && <ProtocolUrlHandler />}
      <AgentIdSync />
    </>
  );
};

export default Layout;
