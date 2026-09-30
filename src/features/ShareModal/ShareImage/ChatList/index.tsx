import { type ConversationContext, type UIChatMessage } from '@orvilo/types';
import { memo } from 'react';

import { ConversationProvider } from '@/features/Conversation/ConversationProvider';
import MessageItem from '@/features/Conversation/Messages';
import { useConversationStore } from '@/features/Conversation/store';

interface ChatListContentProps {
  ids: string[];
}

const ChatListContent = memo<ChatListContentProps>(({ ids }) => {
  const displayMessageIds = useConversationStore((s) => s.displayMessages.map((m) => m.id));
  const renderedIds = ids.length > 0 ? ids : displayMessageIds;

  return (
    <div
      className="flex flex-col h-full w-full"
      style={{ padding: 24, pointerEvents: 'none', position: 'relative' }}
    >
      {renderedIds.map((id, index) => (
        <MessageItem id={id} index={index} key={id} />
      ))}
    </div>
  );
});

ChatListContent.displayName = 'ShareImageChatListContent';

interface ChatListProps {
  context: ConversationContext;
  ids: string[];
  messages: UIChatMessage[];
}

const ChatList = memo<ChatListProps>(({ context, ids, messages }) => {
  const hasInitMessages = messages.length > 0;

  return (
    <ConversationProvider
      context={context}
      hasInitMessages={hasInitMessages}
      messages={messages}
      skipFetch={true}
    >
      <ChatListContent ids={ids} />
    </ConversationProvider>
  );
});

export default ChatList;
