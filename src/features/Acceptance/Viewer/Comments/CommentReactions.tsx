'use client';

import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import type { AcceptanceCommentReaction } from '@orvilo/types';
import { cn } from 'cn';
import { PlusIcon, SmilePlus } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsDark } from '@/hooks/useIsDark';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

/** The ten GitHub offers, in GitHub's order — the shortcut covers nearly every click. */
const QUICK_REACTIONS = ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀', '🙏', '🔥'];

const styles = {
  bar: 'pt-2.5',
  chip: 'inline-flex h-6 cursor-pointer items-center gap-[5px] rounded-[999px] border border-sidebar-border bg-(--ant-color-fill-quaternary) px-2 py-0 text-[13px] leading-none hover:border-border',
  chipMine:
    'border-(--ant-color-info-border) bg-[color-mix(in_srgb,var(--info)_10%,transparent)] text-(--ant-color-info-text)',
  count: 'text-[12px] text-muted-foreground',
  emojiButton:
    'flex size-[30px] cursor-pointer items-center justify-center rounded-(--ant-border-radius) text-[17px] hover:bg-selected',
  moreButton:
    'flex size-[30px] cursor-pointer items-center justify-center rounded-(--ant-border-radius) text-(--ant-color-text-tertiary) hover:bg-selected hover:text-foreground',
  // Always discoverable; the open picker keeps the same emphasis as hover.
  trigger:
    'inline-flex size-6 cursor-pointer items-center justify-center rounded-[999px] border border-sidebar-border text-(--ant-color-text-tertiary) transition-[color] duration-(--ant-motion-duration-fast) ease-[ease] hover:bg-(--ant-color-fill-quaternary) hover:text-foreground data-[open]:bg-(--ant-color-fill-quaternary) data-[open]:text-foreground',
};

interface CommentReactionsProps {
  /** Absent for a reader who may not write — the chips stay, the button goes. */
  onReact?: (emoji: string, on: boolean) => Promise<void>;
  reactions: AcceptanceCommentReaction[];
}

/**
 * Agreement without another message. One row of chips under the words, plus the
 * add button GitHub puts there: on a review page most replies are "yes, this
 * one" or "no", and spending a whole timeline entry on that buries the remarks
 * that actually say something.
 */
const CommentReactions = memo<CommentReactionsProps>(({ onReact, reactions }) => {
  const { t } = useTranslation('verify');
  const isDark = useIsDark();
  const locale = useGlobalStore(globalGeneralSelectors.currentLanguage);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);

  if (reactions.length === 0 && !onReact) return null;

  const fire = async (emoji: string, on: boolean) => {
    try {
      await onReact?.(emoji, on);
    } catch (cause) {
      console.error('[acceptance:comments]', cause);
      toast.error(t('acceptance.comments.updateFailed'));
    }
  };

  const pick = (emoji: string) => {
    setOpen(false);
    setFull(false);
    void fire(emoji, true);
  };

  const picker = full ? (
    <Picker
      data={data}
      locale={locale?.split('-')[0] || 'en'}
      previewPosition={'none'}
      skinTonePosition={'none'}
      theme={isDark ? 'dark' : 'light'}
      onEmojiSelect={(emoji: { native: string }) => pick(emoji.native)}
    />
  ) : (
    <div className="flex gap-0.5 flex-wrap" style={{ padding: 4 }}>
      {QUICK_REACTIONS.map((emoji) => (
        <div
          {...clickableProps()}
          className={cn(styles.emojiButton, CLICKABLE_FOCUS_RING)}
          key={emoji}
          onClick={() => pick(emoji)}
        >
          {emoji}
        </div>
      ))}
      <div
        {...clickableProps()}
        className={cn(styles.moreButton, CLICKABLE_FOCUS_RING)}
        onClick={() => setFull(true)}
      >
        <PlusIcon size={15} />
      </div>
    </div>
  );

  // The button leads and the emoji follow: it is the one fixed thing in this
  // row, so it stays where the reader last clicked it instead of sliding right
  // by one chip every time somebody reacts.
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${styles.bar}`}>
      {onReact && (
        <Popover
          open={open}
          onOpenChange={(visible) => {
            setOpen(visible);
            if (!visible) setFull(false);
          }}
        >
          <PopoverTrigger
            render={
              <span
                data-comment-reaction-add
                className={styles.trigger}
                title={t('acceptance.comments.addReaction')}
                {...(open ? { 'data-open': '' } : {})}
              >
                <SmilePlus size={13} />
              </span>
            }
          />
          <PopoverContent align={'start'} className={'w-auto p-0'} side={'top'}>
            {picker}
          </PopoverContent>
        </Popover>
      )}
      {reactions.map((reaction) => (
        <Tooltip key={reaction.emoji}>
          <TooltipTrigger
            render={
              <span>
                <span
                  {...clickableProps(onReact)}
                  style={onReact ? undefined : { cursor: 'default' }}
                  className={cn(
                    styles.chip,
                    reaction.mine && styles.chipMine,
                    CLICKABLE_FOCUS_RING,
                  )}
                  onClick={onReact ? () => void fire(reaction.emoji, !reaction.mine) : undefined}
                >
                  <span>{reaction.emoji}</span>
                  <span className={styles.count}>{reaction.count}</span>
                </span>
              </span>
            }
          />
          <TooltipContent>
            {reaction.authorNames.length > 0 ? reaction.authorNames.join('、') : reaction.emoji}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
});

CommentReactions.displayName = 'AcceptanceCommentReactions';

export default CommentReactions;
