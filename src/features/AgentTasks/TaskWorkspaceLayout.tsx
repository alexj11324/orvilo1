'use client';

import { memo } from 'react';
import { Outlet } from 'react-router';

import { MOBILE_TABBAR_HEIGHT } from '@/const/layoutTokens';
import AgentTaskManager from '@/features/AgentTaskManager';
import { useMobileNavVisible } from '@/features/MobileNav/navContext';
import MobilePortal from '@/features/Portal/Mobile';
import { useIsMobile } from '@/hooks/useIsMobile';

const TaskWorkspaceLayout = memo(() => {
  const isMobile = useIsMobile();
  const navVisible = useMobileNavVisible();

  return (
    <div className={`flex h-full w-full flex-1${isMobile ? ' flex-col' : ''}`}>
      <div
        className="flex flex-1 flex-col"
        style={{
          minWidth: 0,
          // The fixed tab bar overlays this scroll area on nav routes; reserve
          // its height plus the iOS home-indicator inset so list ends are
          // reachable instead of clipped behind the bar.
          paddingBottom:
            isMobile && navVisible
              ? `calc(${MOBILE_TABBAR_HEIGHT}px + env(safe-area-inset-bottom))`
              : 0,
        }}
      >
        <Outlet />
      </div>
      {isMobile ? <MobilePortal /> : <AgentTaskManager />}
    </div>
  );
});

TaskWorkspaceLayout.displayName = 'TaskWorkspaceLayout';

export default TaskWorkspaceLayout;
