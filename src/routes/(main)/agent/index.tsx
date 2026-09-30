'use client';

import Conversation from './features/Conversation';
import ChatHydration from './features/Conversation/ChatHydration';
import TelemetryNotification from './features/TelemetryNotification';

const ChatPage = () => {
  return (
    <>
      <ChatHydration />
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
