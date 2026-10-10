'use client';

import { cn } from 'cn';
import { ArrowDownToLine } from 'lucide-react';
import { memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { messageStateSelectors, useConversationStore } from '../store';

const styles = {
  button:
    'pointer-events-auto bg-popover text-popover-foreground hover:bg-accent hover:text-foreground shadow-(--shadow-popover)',
  line: 'flex-1 [block-size:0] [border-block-start:1px_dashed_var(--border)]',
  wrap: 'pointer-events-none absolute z-20 [inset-block-start:75%] inset-x-0 [transform:translateY(-50%)]',
};

/**
 * "Select to here" marker shown while multi-selecting: a dashed line across the
 * chat area near the bottom, with a button that selects every message from the
 * top of the conversation down to the line. Renders nothing outside selection
 * mode.
 */
const SelectToHereButton = memo(() => {
  const { t } = useTranslation('chat');
  const wrapRef = useRef<HTMLDivElement>(null);
  const isSelectionMode = useConversationStore(messageStateSelectors.isSelectionMode);
  const selectToHere = useConversationStore((s) => s.selectToHere);

  const handleClick = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const lineY = rect.top + rect.height / 2;

    // The last selectable message whose top edge sits at or above the line is
    // "here"; the store then selects everything from the top down to it
    // (including messages scrolled above the viewport).
    let targetId: string | undefined;
    for (const node of wrap.ownerDocument.querySelectorAll<HTMLElement>('[data-message-id]')) {
      if (node.getBoundingClientRect().top <= lineY) {
        targetId = node.dataset.messageId ?? targetId;
      }
    }
    if (targetId) selectToHere(targetId);
  }, [selectToHere]);

  if (!isSelectionMode) return null;

  return (
    <div className={cn('flex items-center gap-3 px-4', styles.wrap)} ref={wrapRef}>
      <div className={styles.line} />
      <Button
        className={cn(styles.button, 'rounded-(--radius-button) leading-5.5')}
        size="compact"
        onClick={handleClick}
      >
        <ArrowDownToLine className="size-3.5" /> {t('messageForward.bar.selectToHere')}
      </Button>
      <div className={styles.line} />
    </div>
  );
});

SelectToHereButton.displayName = 'MessageForwardSelectToHereButton';

export default SelectToHereButton;
