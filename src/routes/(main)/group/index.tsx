'use client';

import { memo } from 'react';

import Conversation from './features/Conversation';
import Portal from './features/Portal';
import TelemetryNotification from './features/TelemetryNotification';

const ChatPage = memo(() => {
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
