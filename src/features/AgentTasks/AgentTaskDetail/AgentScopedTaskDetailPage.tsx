'use client';

import { memo } from 'react';

import AgentTaskManager from '@/features/AgentTaskManager';
import MobilePortal from '@/features/Portal/Mobile';
import { useIsMobile } from '@/hooks/useIsMobile';

import { useCanonicalTaskSlug } from '../shared/useCanonicalTaskSlug';
import TaskDetailPage from './TaskDetailPage';

interface AgentScopedTaskDetailPageProps {
  agentId?: string;
  taskId: string;
}

const AgentScopedTaskDetailPage = memo<AgentScopedTaskDetailPageProps>(({ agentId, taskId }) => {
  const isMobile = useIsMobile();

  // This component is a route entry, so it owns the address bar and keeps the
  // readable slug tail in step with the title.
  useCanonicalTaskSlug(taskId);

  return (
    <div className="flex flex-1" style={{ height: '100%', minHeight: 0, width: '100%' }}>
      <div className="flex flex-1" style={{ minWidth: 0 }}>
        <TaskDetailPage showTaskAgentPanelToggle={!isMobile} taskId={taskId} />
      </div>
      {isMobile ? (
        <MobilePortal />
      ) : (
        <AgentTaskManager preferredAgentId={agentId} viewedTaskId={taskId} />
      )}
    </div>
  );
});

AgentScopedTaskDetailPage.displayName = 'AgentScopedTaskDetailPage';

export default AgentScopedTaskDetailPage;
