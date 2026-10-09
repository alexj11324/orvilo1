'use client';

import type { EmojiReaction } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import { usePermission } from '@/hooks/usePermission';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = createStaticStyles(({ css, cssVar }) => ({
  active: css`
    background: ${cssVar.colorFillTertiary};
  `,
  container: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  `,
  count: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  reactionTag: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    height: 28px;
    padding-block: 0;
    padding-inline: 10px;
    border-radius: 14px;

    font-size: 14px;
    line-height: 1;

    background: ${cssVar.colorFillSecondary};

    transition: all 0.2s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

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

  return (
    <div className={cn('flex items-center', styles.container)}>
      {reactions.map((reaction) => (
        <div
          {...clickableProps(canEdit)}
          key={reaction.emoji}
          style={{ cursor: canEdit ? undefined : 'default' }}
          className={cn(
            cx(styles.reactionTag, isActive?.(reaction.emoji) && styles.active),
            CLICKABLE_FOCUS_RING,
          )}
          onClick={canEdit ? () => onReactionClick?.(reaction.emoji) : undefined}
        >
          <span>{reaction.emoji}</span>
          {reaction.count > 1 && <span className={styles.count}>{reaction.count}</span>}
        </div>
      ))}
    </div>
  );
});

ReactionDisplay.displayName = 'ReactionDisplay';

export default ReactionDisplay;
