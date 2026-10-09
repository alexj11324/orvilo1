'use client';

import { useSize } from 'ahooks';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { memo, useRef } from 'react';
import { Outlet } from 'react-router';

import ChatTerminalPanel from '@/features/ChatTerminal';
import AgentWorkingSidebar from '@/features/Conversation/WorkingSidebar';
import OverviewSlot from '@/features/Conversation/WorkingSidebar/OverviewSlot';
import ChatHistoryUtilityRow from '@/routes/(main)/agent/features/Conversation/ChatHistory/UtilityRow';
import ChatHeader from '@/routes/(main)/agent/features/Conversation/Header';
import Portal from '@/routes/(main)/agent/features/Portal';

import HeaderSlot from './HeaderSlot';

const styles = createStaticStyles(({ css }) => ({
  // Named container queried by ChatHeader and the list top spacer: when this
  // column is wide enough, the header floats above the full-bleed message
  // stream instead of sitting in flow as a solid bar.
  conversationColumn: css`
    position: relative;
    container-name: agent-chat-layout;
    container-type: inline-size;
  `,
}));

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
              // Keep the floating history utility clear of approval actions when the composer is hidden.
              style={{ minHeight: 0, minWidth: 0 }}
              className={cn(
                'flex flex-col flex-1 has-[[data-intervention-placement=bottom]]:pb-10',
                styles.conversationColumn,
              )}
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
            {/* Shared bottom-right `Chat history` control — opens the same
                history menu as the header title trigger. */}
            <ChatHistoryUtilityRow />
          </div>
          <ChatTerminalPanel />
        </div>
      </OverviewSlot.Provider>
    </HeaderSlot.Provider>
  );
});

ChatLayout.displayName = 'ChatLayout';

export default ChatLayout;
