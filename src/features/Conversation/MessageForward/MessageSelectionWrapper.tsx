'use client';

import { cn } from 'cn';
import { memo, type MouseEvent, type ReactNode, useCallback } from 'react';

import { CONVERSATION_MIN_WIDTH } from '@/const/layoutTokens';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { messageStateSelectors, useConversationStore } from '../store';
import { isSelectableRole } from './selectableRoles';
import SelectCircle from './SelectCircle';

const styles = {
  contentAssistant: '[&_.message-wrapper]:items-start [&_.message-wrapper]:ps-0',
  band: 'cursor-pointer select-none w-full transition-[background-color] duration-(--orvilo-motion-fast) ease-(--orvilo-motion-ease-in-out) hover:bg-accent motion-reduce:transition-none',
  bandSelected: 'bg-selected hover:bg-selected',
  checkbox: 'flex-none ps-4',
  content:
    'pointer-events-none flex-1 min-w-0 [&_[data-user-action-bar-portal]]:hidden [&_[data-assitant-action-bar-portal]]:hidden [&_[data-assistant-group-action-bar-portal]]:hidden [&_.message-header]:hidden',
  contentCollapsed:
    'overflow-hidden max-h-21 [mask-image:linear-gradient(to_bottom,#000_56%,transparent_100%)]',
  disabledBand: 'cursor-not-allowed w-full opacity-40',
  lane: 'px-4',
};

interface MessageSelectionWrapperProps {
  children: ReactNode;
  id: string;
  role?: string;
}

/**
 * In multi-select mode, wraps a message with a full-bleed clickable band and a
 * round checkbox pinned to the band's leading edge. The band stretches to the
 * full stream width, while the inner lane keeps the content at the usual
 * reading-column width. Outside selection mode it renders the message untouched.
 */
const MessageSelectionWrapper = memo<MessageSelectionWrapperProps>(({ children, id, role }) => {
  const isSelectionMode = useConversationStore(messageStateSelectors.isSelectionMode);
  const isSelected = useConversationStore(messageStateSelectors.isMessageSelected(id));
  const toggleMessageSelected = useConversationStore((s) => s.toggleMessageSelected);
  const selectRange = useConversationStore((s) => s.selectRange);
  const wideScreen = useGlobalStore(systemStatusSelectors.wideScreen);

  const selectable = isSelectableRole(role);
  const isAssistant = role === 'assistant' || role === 'assistantGroup';

  const handleToggle = useCallback(
    (event: MouseEvent) => {
      if (!selectable) return;
      // Shift-click extends the selection from the anchor to this message.
      if (event.shiftKey) selectRange(id);
      else toggleMessageSelected(id);
    },
    [selectable, selectRange, toggleMessageSelected, id],
  );

  if (!isSelectionMode) return <>{children}</>;

  // Mirror WideScreenContainer's column width so selection content lines up with
  // the rest of the conversation.
  const laneWidth = wideScreen ? '100%' : `min(${CONVERSATION_MIN_WIDTH}px, 100%)`;

  const inner = (
    <>
      <div className={styles.checkbox}>{selectable && <SelectCircle checked={isSelected} />}</div>
      <div className="flex flex-col items-center flex-1 min-w-0">
        <div className={cn('flex flex-col', styles.lane)} style={{ width: laneWidth }}>
          <div
            className={cn(
              styles.content,
              isAssistant && styles.contentAssistant,
              isAssistant && styles.contentCollapsed,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );

  if (!selectable) {
    return <div className={cn('flex items-center', styles.disabledBand)}>{inner}</div>;
  }

  return (
    <div
      className={cn('flex items-center', cn(styles.band, isSelected && styles.bandSelected))}
      onClick={handleToggle}
    >
      {inner}
    </div>
  );
});

MessageSelectionWrapper.displayName = 'MessageSelectionWrapper';

export default MessageSelectionWrapper;
