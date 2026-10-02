'use client';

import { CHAT_NEW_URL, CHAT_TOPIC_URL } from '@orvilo/const';
import { memo } from 'react';
import { useParams } from 'react-router';

import TopicOwnerSync from '@/features/Conversation/TopicOwnerSync';
import TopicInPopupGuard from '@/features/TopicPopupGuard';
import { useTopicInPopup } from '@/features/TopicPopupGuard/useTopicPopupsRegistry';
import Conversation from '@/routes/(main)/agent/features/Conversation';
import ChatHydration from '@/routes/(main)/agent/features/Conversation/ChatHydration';
import TelemetryNotification from '@/routes/(main)/agent/features/TelemetryNotification';
import { useChatStore } from '@/store/chat';

const getConversationPath = () => CHAT_NEW_URL;
const getTopicPath = (_agentId: string, topicId: string) => CHAT_TOPIC_URL(topicId);

const ChatPage = memo(() => {
  const { topicId: urlTopicId } = useParams<{ topicId?: string }>();
  const activeAgentId = useChatStore((s) => s.activeAgentId);
  const popup = useTopicInPopup({
    agentId: activeAgentId,
    topicId: urlTopicId ?? '',
  });

  // When the same topic is already hosted in a popup window, avoid
  // rendering a second (out-of-sync) instance here — guide the user back
  // to the popup instead.
  const pageContent =
    urlTopicId && popup ? (
      <TopicInPopupGuard popup={popup} />
    ) : (
      <>
        <div
          className="flex"
          style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}
        >
          <Conversation />
        </div>
        <TelemetryNotification mobile={false} />
      </>
    );

  return (
    <>
      <TopicOwnerSync />
      <ChatHydration getConversationPath={getConversationPath} getTopicPath={getTopicPath} />
      {pageContent}
    </>
  );
});

ChatPage.displayName = 'ChatPage';

export default ChatPage;
