'use client';

import { memo, useCallback } from 'react';

import { ChatList } from '@/features/Conversation';
import MessageItem from '@/features/Conversation/Messages';

import { GoalChatProvider } from './GoalChatProvider';
import Toolbar from './Toolbar';

interface GoalChatProps {
  agentId: string;
  goalId: string;
  initialTopicId?: string;
  onCollapse: () => void;
}

const GoalChat = memo<GoalChatProps>(({ agentId, goalId, initialTopicId, onCollapse }) => {
  const itemContent = useCallback(
    (index: number, id: string) => <MessageItem disableEditing id={id} index={index} />,
    [],
  );
  return (
    <GoalChatProvider agentId={agentId} goalId={goalId} initialTopicId={initialTopicId}>
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <Toolbar onCollapse={onCollapse} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <ChatList disableActionsBar itemContent={itemContent} />
        </div>
      </div>
    </GoalChatProvider>
  );
});
GoalChat.displayName = 'GoalChat';
export default GoalChat;
