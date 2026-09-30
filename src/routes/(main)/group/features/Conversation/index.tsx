import { memo } from 'react';

import DragUploadZone, { useUploadFiles } from '@/components/DragUploadZone';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';

import ConversationArea from './ConversationArea';
import ChatHeader from './Header';

const ChatConversation = memo(() => {
  // Get current agent's model info for vision support check
  const agentId = useAgentStore((s) => s.activeAgentId || '');
  const model = useAgentStore(agentSelectors.currentAgentModel);
  const provider = useAgentStore(agentSelectors.currentAgentModelProvider);
  const { handleUploadFiles } = useUploadFiles({ agentId, model, provider });

  return (
    <DragUploadZone style={{ height: '100%', width: '100%' }} onUploadFiles={handleUploadFiles}>
      <div
        className="flex flex-col"
        style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}
      >
        <ChatHeader />
        <ConversationArea />
      </div>
    </DragUploadZone>
  );
});

ChatConversation.displayName = 'ChatConversation';

export default ChatConversation;
