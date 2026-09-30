'use client';

import AgentHome from '@/features/AgentHome';
import { ChatList } from '@/features/Conversation';

const ChatBody = () => {
  return (
    <div
      className="flex flex-col flex-1 h-full w-full"
      data-testid="floating-chat-panel-body"
      style={{ minHeight: 0, overflow: 'hidden', position: 'relative' }}
    >
      <ChatList welcome={<AgentHome />} />
    </div>
  );
};

export default ChatBody;
