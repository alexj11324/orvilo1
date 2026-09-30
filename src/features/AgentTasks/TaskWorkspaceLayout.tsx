'use client';

import { memo } from 'react';
import { Outlet } from 'react-router';

import AgentTaskManager from '@/features/AgentTaskManager';
import MobilePortal from '@/features/Portal/Mobile';
import { useIsMobile } from '@/hooks/useIsMobile';

const TaskWorkspaceLayout = memo(() => {
  const isMobile = useIsMobile();

  return (
    <div className={`flex h-full w-full flex-1${isMobile ? ' flex-col' : ''}`}>
      <div className="flex flex-1 flex-col" style={{ minWidth: 0 }}>
        <Outlet />
      </div>
      {isMobile ? <MobilePortal /> : <AgentTaskManager />}
    </div>
  );
});

TaskWorkspaceLayout.displayName = 'TaskWorkspaceLayout';

export default TaskWorkspaceLayout;
