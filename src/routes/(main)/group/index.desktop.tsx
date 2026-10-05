'use client';

import { memo } from 'react';

import TopicInPopupGuard from '@/features/TopicPopupGuard';
import { useTopicInPopup } from '@/features/TopicPopupGuard/useTopicPopupsRegistry';
import { useChatStore } from '@/store/chat';

import Conversation from './features/Conversation';
import ChatHydration from './features/Conversation/ChatHydration';
import Portal from './features/Portal';
import TelemetryNotification from './features/TelemetryNotification';

const ChatPage = memo(() => {
  const activeGroupId = useChatStore((s) => s.activeGroupId);
  const activeTopicId = useChatStore((s) => s.activeTopicId);
  const popup = useTopicInPopup({
    groupId: activeGroupId,
    topicId: activeTopicId ?? '',
  });

  if (activeTopicId && popup) {
    return (
      <>
        <ChatHydration />
        <TopicInPopupGuard popup={popup} />
      </>
    );
  }

  return (
    <>
      <div
        className="flex"
        style={{ height: '100%', width: '100%', overflow: 'hidden', position: 'relative' }}
      >
        <Conversation />
        <Portal />
      </div>
      <TelemetryNotification mobile={false} />
    </>
  );
});

export default ChatPage;
