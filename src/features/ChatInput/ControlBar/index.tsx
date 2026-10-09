import { cn } from 'cn';
import { memo } from 'react';

import ChatInputCredits from '@/business/client/features/ChatInputCredits';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';

import ContextWindow from '../ActionBar/Token';
import { useAgentId } from '../hooks/useAgentId';
import { useChatInputResourceAccess } from '../hooks/useChatInputResourceAccess';
import { useEffectiveAgentMode } from '../hooks/useEffectiveAgentMode';
import { useChatInputStore } from '../store';
import ApprovalMode from './ApprovalMode';
import ModeSelector from './ModeSelector';
import WorkspaceControls from './WorkspaceControls';

const styles = {
  bar: 'flex-none h-7 py-0 px-1',
  leftGroup:
    '[scrollbar-width:none] overflow-x-auto overflow-y-hidden flex-1 min-w-0 [&::-webkit-scrollbar]:hidden',
  rightGroup: 'flex-none',
};

const ControlBar = memo(() => {
  const agentId = useAgentId();
  const { canShowControls } = useChatInputResourceAccess();
  const showContextWindow = useChatInputStore((s) =>
    s.rightActions.flat().includes('contextWindow'),
  );

  const isLoading = useAgentStore((s) => agentByIdSelectors.isAgentConfigLoadingById(agentId)(s));
  const { isAgentRuntimeMode, isPreferenceLoading } = useEffectiveAgentMode(agentId);

  if (!canShowControls || isPreferenceLoading) return null;

  // Skeleton placeholder to prevent layout jump during loading
  if (!agentId || isLoading) {
    return (
      <div className={cn('flex flex-row items-center gap-1', styles.bar)}>
        <Skeleton style={{ height: 22, minWidth: 64, width: 64 }} />
        <Skeleton style={{ height: 22, minWidth: 100, width: 100 }} />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-row items-center justify-between', styles.bar)}>
      {/* Left: chat-mode switcher + (agent-only) execution device + working directory */}
      <div className={cn('flex flex-row items-center gap-1', styles.leftGroup)}>
        <ModeSelector />
        {isAgentRuntimeMode && <WorkspaceControls agentId={agentId} />}
      </div>

      <div className={cn('flex flex-row items-center gap-1', styles.rightGroup)}>
        <ChatInputCredits />
        {isAgentRuntimeMode && <ApprovalMode />}
        {showContextWindow && <ContextWindow />}
      </div>
    </div>
  );
});

ControlBar.displayName = 'ControlBar';

export default ControlBar;
