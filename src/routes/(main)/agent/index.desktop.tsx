'use client';

import { memo } from 'react';
import { useParams } from 'react-router';

import TopicInPopupGuard from '@/features/TopicPopupGuard';
import { useTopicInPopup } from '@/features/TopicPopupGuard/useTopicPopupsRegistry';
import { useChatStore } from '@/store/chat';

import Conversation from './features/Conversation';
import ChatHydration from './features/Conversation/ChatHydration';
import TelemetryNotification from './features/TelemetryNotification';

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
      <ChatHydration />
      {pageContent}
    </>
  );
});

export default ChatPage;
