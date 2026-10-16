import { cn } from 'cn';
import { type FC } from 'react';
import { Outlet } from 'react-router';

import { isDesktop } from '@/const/version';
import { AgentNotFoundGuard, AgentRuntimeWithheldGuard } from '@/features/AgentNotFound';
import ProtocolUrlHandler from '@/features/ProtocolUrlHandler';
import { TopicNotFoundGuard } from '@/features/TopicNotFound';
import AgentIdSync from '@/routes/(main)/agent/_layout/AgentIdSync';

import RegisterHotkeys from './RegisterHotkeys';
import { styles } from './style';

const Layout: FC = () => {
  return (
    <>
      <div className={cn('flex flex-col flex-1', styles.mainContainer)} style={{ height: '100%' }}>
        {/* Keep the sidebar interactive when the routed agent is gone (deleted
            or made private) — only the content area collapses to the 404 card. */}
        <AgentNotFoundGuard>
          {/* Deleted / inaccessible topic on a stale row or deep link: swap
              the conversation surface for a 404 card once the detail fetch
              settles — same layered fallback as the agent guard above. */}
          <AgentRuntimeWithheldGuard>
            <TopicNotFoundGuard>
              <Outlet />
            </TopicNotFoundGuard>
          </AgentRuntimeWithheldGuard>
        </AgentNotFoundGuard>
      </div>
      <RegisterHotkeys />
      {isDesktop && <ProtocolUrlHandler />}
      <AgentIdSync />
    </>
  );
};

export default Layout;
