'use client';

import { CHAT_NEW_URL, CHAT_TOPIC_URL } from '@orvilo/const';

import AgentSidebar from '@/features/AgentSidebar';
import TopicOwnerSync from '@/features/Conversation/TopicOwnerSync';
import Conversation from '@/routes/(main)/agent/features/Conversation';
import ChatHydration from '@/routes/(main)/agent/features/Conversation/ChatHydration';
import TelemetryNotification from '@/routes/(main)/agent/features/TelemetryNotification';

const getConversationPath = () => CHAT_NEW_URL;
const getTopicPath = (_agentId: string, topicId: string) => CHAT_TOPIC_URL(topicId);

/**
 * `/chat/:topicId` and `/chat/new` — the conversation-stable route: the URL
 * keys on the topic alone and `TopicOwnerSync` binds the owner agent, so an
 * agent handoff never navigates containers. `ChatHydration` emits these same
 * paths, keeping the address bar canonical whenever the store writes back.
 */
const ChatPage = () => {
  return (
    <>
      {/* The `agent` nav panel lives behind a portal, so it must be mounted by
          the owning route — `/agent/:aid` registers it via its layout; the
          conversation route owns it here. */}
      <AgentSidebar />
      <TopicOwnerSync />
      <ChatHydration getConversationPath={getConversationPath} getTopicPath={getTopicPath} />
      <div
        className="flex flex-col"
        style={{
          height: '100%',
          width: '100%',
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Conversation />
      </div>
      <TelemetryNotification mobile={false} />
    </>
  );
};

export default ChatPage;
