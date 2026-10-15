'use client';

import { memo } from 'react';

import DraggablePanel from '@/components/DraggablePanel';
import { CHAT_PORTAL_TOOL_UI_WIDTH } from '@/const/layoutTokens';
import { PortalContent } from '@/features/Portal/router';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';

import slotStyles from './SharePortal.module.css';

const styles = {
  body: 'overflow-hidden flex flex-1 flex-col h-0 pbe-3',
  content: slotStyles.content,
  drawer: 'z-10 h-full bg-card',
};

const SharePortal = memo(() => {
  const showPortal = useChatStore(chatPortalSelectors.showPortal);

  return (
    <DraggablePanel
      className={styles.drawer}
      classNames={{ content: styles.content }}
      defaultSize={{ width: CHAT_PORTAL_TOOL_UI_WIDTH }}
      expand={showPortal}
      expandable={false}
      minWidth={CHAT_PORTAL_TOOL_UI_WIDTH}
      placement="right"
      showHandleWhenCollapsed={false}
      showHandleWideArea={false}
      size={{ height: '100%', width: CHAT_PORTAL_TOOL_UI_WIDTH }}
    >
      <PortalContent renderBody={(body) => <div className={styles.body}>{body}</div>} />
    </DraggablePanel>
  );
});

SharePortal.displayName = 'SharePortal';

export default SharePortal;
