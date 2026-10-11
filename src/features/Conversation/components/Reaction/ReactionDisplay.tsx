'use client';

import type { EmojiReaction } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';

import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { CLICKABLE_FOCUS_RING } from '@/utils/clickableProps';

const styles = {
  active: 'bg-selected hover:bg-selected',
  container: 'flex flex-wrap gap-1',
  count: 'text-xs leading-5 text-muted-foreground',
  reactionTag:
    'relative cursor-pointer inline-flex gap-1 items-center py-0 px-2.5 rounded-(--radius-button) text-sm leading-5.5 bg-fill-quaternary transition-[background-color] duration-(--orvilo-motion-fast) hover:bg-accent motion-reduce:transition-none',
};

interface ReactionDisplayProps {
  /**
   * Whether the current user has reacted (used for single-user mode)
   */
  isActive?: (emoji: string) => boolean;
  /**
   * Callback when a reaction is clicked
   */
  onReactionClick?: (emoji: string) => void;
  /**
   * The reactions to display
   */
  reactions: EmojiReaction[];
}

const ReactionDisplay = memo<ReactionDisplayProps>(({ reactions, onReactionClick, isActive }) => {
  const { allowed: canEdit } = usePermission('edit_own_content');

  if (reactions.length === 0) return null;

  const ReactionTag = canEdit ? Button : 'div';

  return (
    <div className={cn('flex items-center', styles.container)}>
      {reactions.map((reaction) => (
        <span
          className={cn('inline-flex flex-none', canEdit && 'coarse:p-1.5')}
          key={reaction.emoji}
        >
          <ReactionTag
            {...(canEdit
              ? { size: 'compact' as const, type: 'button' as const, variant: 'ghost' as const }
              : {})}
            style={{ cursor: canEdit ? undefined : 'default' }}
            className={cn(
              cn(styles.reactionTag, isActive?.(reaction.emoji) && styles.active),
              CLICKABLE_FOCUS_RING,
              canEdit
                ? "coarse:after:absolute coarse:after:-inset-[calc(var(--spacing)*1.75)] coarse:after:content-['']"
                : 'h-8',
            )}
            onClick={canEdit ? () => onReactionClick?.(reaction.emoji) : undefined}
          >
            <span className="text-base leading-6">{reaction.emoji}</span>
            {reaction.count > 1 && <span className={styles.count}>{reaction.count}</span>}
          </ReactionTag>
        </span>
      ))}
    </div>
  );
});

ReactionDisplay.displayName = 'ReactionDisplay';

export default ReactionDisplay;
