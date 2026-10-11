'use client';

import { ChevronDown } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ChatHistoryMenu from './index';

const styles = {
  label: 'min-w-0 truncate',
  trigger:
    'inline-flex h-8 pointer-coarse:h-11 max-w-full cursor-pointer items-center gap-1 rounded-full border-0 bg-transparent px-2 text-sm leading-5.5 font-medium text-foreground transition-[background-color] duration-150 ease-[ease] hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring/50 focus-visible:outline-offset-[-1px] data-[popup-open]:bg-accent motion-reduce:transition-none',
} as const;

interface ChatHistoryTitleMenuProps {
  title: string;
}

/**
 * The page header's chat-title trigger — opens the shared chat-history menu.
 * Replaces the reference's `New chat ⌄` title button (`Switch agent chat`).
 */
const ChatHistoryTitleMenu = memo<ChatHistoryTitleMenuProps>(({ title }) => {
  const { t } = useTranslation('chat');

  return (
    <ChatHistoryMenu
      nativeButton
      classNames={{ trigger: styles.trigger }}
      placement={'bottomLeft'}
      triggerProps={{
        'aria-label': t('chatHistory.switchAgentChat'),
        'type': 'button',
      }}
    >
      <span className={styles.label}>{title}</span>
      <ChevronDown size={14} />
    </ChatHistoryMenu>
  );
});

ChatHistoryTitleMenu.displayName = 'ChatHistoryTitleMenu';

export default ChatHistoryTitleMenu;
