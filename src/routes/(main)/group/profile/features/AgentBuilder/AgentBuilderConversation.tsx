import { memo } from 'react';

import AgentBuilderWelcome from '@/features/AgentBuilder/AgentBuilderWelcome';
import { builderLeftActions, builderRightActions } from '@/features/AgentBuilder/composerActions';
import { useResolveFeedbackOnSend } from '@/features/AgentBuilder/SuggestionChips/useResolveFeedbackOnSend';
import { ChatInput, ChatList } from '@/features/Conversation';
import { usePermission } from '@/hooks/usePermission';

import TopicSelector from './TopicSelector';

interface AgentBuilderConversationProps {
  agentId: string;
}

/**
 * Agent Builder Conversation Component
 * Displays the chat interface for configuring the agent via conversation
 */
const AgentBuilderConversation = memo<AgentBuilderConversationProps>(({ agentId }) => {
  const { allowed: canCreate } = usePermission('create_content');

  // Resolve usage_in_followup / manual_edit feedback when a suggestion-seeded
  // message is sent (no-op for normal sends).
  useResolveFeedbackOnSend();

  return (
    <div className="flex flex-col flex-1" style={{ height: '100%' }}>
      <TopicSelector agentId={agentId} disabled={!canCreate} />
      <div className="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
        <ChatList welcome={<AgentBuilderWelcome disabled={!canCreate} mode="groupBuilder" />} />
      </div>
      <ChatInput
        leftActions={builderLeftActions}
        rightActions={builderRightActions}
        showControlBar={false}
      />
    </div>
  );
});

export default AgentBuilderConversation;
