'use client';

import { History } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ChatHistoryMenu from './index';

const styles = {
  row: 'pointer-events-none absolute end-3 inset-be-3 z-20 flex items-center gap-1',
  trigger:
    'pointer-events-auto inline-flex h-8 pointer-coarse:h-11 cursor-pointer items-center gap-1 rounded-full border-0 bg-popover px-2 text-sm leading-5.5 font-medium text-muted-foreground shadow-(--shadow-raised) transition-[background-color,color] duration-(--orvilo-motion-mid) hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-primary focus-visible:outline-offset-[-1px] data-[popup-open]:text-foreground data-[popup-open]:bg-accent motion-reduce:transition-none',
} as const;

/**
 * Bottom-right utility row for the agent chat surface. The reference pairs
 * `Chat history` with a global `Agent` quick-chat overlay — Orvilo has no
 * in-app floating quick-chat counterpart, so only the history control exists
 * here (the gap is recorded in the audit report rather than faked).
 */
const ChatHistoryUtilityRow = memo(() => {
  const { t } = useTranslation('chat');

  return (
    <div className={styles.row}>
      <ChatHistoryMenu
        nativeButton
        classNames={{ trigger: styles.trigger }}
        placement={'topRight'}
        triggerProps={{
          'aria-label': t('chatHistory.title'),
          'type': 'button',
        }}
      >
        <History className="size-4" size={16} />
        <span>{t('chatHistory.title')}</span>
      </ChatHistoryMenu>
    </div>
  );
});

ChatHistoryUtilityRow.displayName = 'ChatHistoryUtilityRow';

export default ChatHistoryUtilityRow;
