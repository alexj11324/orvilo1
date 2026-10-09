'use client';

import { useSize } from 'ahooks';
import { memo, useRef } from 'react';
import { Outlet } from 'react-router';

import ChatTerminalPanel from '@/features/ChatTerminal';
import AgentWorkingSidebar from '@/features/Conversation/WorkingSidebar';
import OverviewSlot from '@/features/Conversation/WorkingSidebar/OverviewSlot';
import ChatHeader from '@/routes/(main)/agent/features/Conversation/Header';
import Portal from '@/routes/(main)/agent/features/Portal';

import HeaderSlot from './HeaderSlot';

const ChatLayout = memo(() => {
  // The working sidebar needs the row width to know whether it still fits next
  // to an open portal — a wide portal otherwise squeezes the conversation out.
  const rowRef = useRef<HTMLDivElement>(null);
  const rowSize = useSize(rowRef);

  return (
    <HeaderSlot.Provider>
      <OverviewSlot.Provider>
        <div
          className="flex flex-col flex-1"
          style={{ height: '100%', width: '100%', minHeight: 0, overflow: 'hidden' }}
        >
          <div
            className="flex flex-1"
            ref={rowRef}
            style={{ width: '100%', minHeight: 0, overflow: 'hidden', position: 'relative' }}
          >
            <div
              className="relative flex min-h-0 min-w-0 flex-1 flex-col"
              style={{ minHeight: 0, minWidth: 0 }}
            >
              <ChatHeader />
              <div className="flex flex-1" style={{ minHeight: 0, minWidth: 0 }}>
                <div className="flex flex-col flex-1" style={{ minHeight: 0, minWidth: 0 }}>
                  <Outlet />
                </div>
                <OverviewSlot.Outlet />
              </div>
            </div>
            <Portal />
            <AgentWorkingSidebar availableWidth={rowSize?.width} />
          </div>
          <ChatTerminalPanel />
        </div>
      </OverviewSlot.Provider>
    </HeaderSlot.Provider>
  );
});

ChatLayout.displayName = 'ChatLayout';

export default ChatLayout;
