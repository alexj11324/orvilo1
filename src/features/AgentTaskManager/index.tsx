import { memo } from 'react';

import RightPanel from '@/features/RightPanel';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import Conversation from './Conversation';
import { TaskAgentProvider } from './TaskAgentProvider';

interface AgentTaskManagerProps {
  preferredAgentId?: string;
  viewedTaskId?: string;
}

const AgentTaskManager = memo<AgentTaskManagerProps>(({ preferredAgentId, viewedTaskId }) => {
  const [expand, toggleTaskAgentPanel] = useGlobalStore((s) => [
    systemStatusSelectors.showTaskAgentPanel(s),
    s.toggleTaskAgentPanel,
  ]);
  return (
    <RightPanel
      defaultWidth={420}
      expand={expand}
      maxWidth={720}
      minWidth={320}
      onExpandChange={(next) => toggleTaskAgentPanel(next)}
    >
      <TaskAgentProvider preferredAgentId={preferredAgentId} viewedTaskId={viewedTaskId}>
        <Conversation />
      </TaskAgentProvider>
    </RightPanel>
  );
});

AgentTaskManager.displayName = 'AgentTaskManager';

export default AgentTaskManager;
