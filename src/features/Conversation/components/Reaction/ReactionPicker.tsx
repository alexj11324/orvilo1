'use client';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { createStaticStyles, useTheme } from 'antd-style';
import { cn } from 'cn';
import { PlusIcon, SmilePlus } from 'lucide-react';
import { type FC, isValidElement, memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePermission } from '@/hooks/usePermission';
import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';

import { useConversationResourceAccess } from '../../hooks/useConversationResourceAccess';
import { useConversationStore } from '../../store';

const QUICK_REACTIONS = ['👍', '👎', '❤️', '😄', '😂', '😅', '🎉', '😢', '🤔', '🚀'];

const styles = createStaticStyles(({ css, cssVar }) => ({
  emojiButton: css`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;
    border-radius: ${cssVar.borderRadius};

    font-size: 18px;

    transition: all 0.2s;

    &:hover {
      transform: scale(1.1);
      background: ${cssVar.colorFillSecondary};
    }
  `,
  moreButton: css`
    cursor: pointer;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 32px;
    height: 32px;
    border-radius: ${cssVar.borderRadius};

    color: ${cssVar.colorTextTertiary};

    transition: all 0.2s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
  pickerContainer: css`
    padding: 4px;
  `,
}));

interface ReactionPickerProps {
  messageId: string;
  trigger?: ReactNode;
}

const ReactionPicker: FC<ReactionPickerProps> = memo(({ messageId, trigger }) => {
  const { t } = useTranslation('chat');
  const theme = useTheme();
  const { allowed: canEdit } = usePermission('edit_own_content');
  const { canUseResource } = useConversationResourceAccess();
  const locale = useGlobalStore(globalGeneralSelectors.currentLanguage);
  const addReaction = useConversationStore((s) => s.addReaction);
  const [open, setOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);

  // Reactions write to the shared conversation — view-only members don't get
  // the affordance (same absent-when-not-applicable rule as message actions).
  if (!canEdit || !canUseResource) return null;

  const handleSelect = (emoji: string) => {
    addReaction(messageId, emoji);
    setOpen(false);
    setShowFullPicker(false);
  };

  const handleOpenChange = (visible: boolean) => {
    setOpen(visible);
    if (!visible) setShowFullPicker(false);
  };

  const content = showFullPicker ? (
    <Picker
      data={data}
      locale={locale?.split('-')[0] || 'en'}
      previewPosition="none"
      skinTonePosition="none"
      theme={theme.appearance === 'dark' ? 'dark' : 'light'}
      onEmojiSelect={(emoji: any) => handleSelect(emoji.native)}
    />
  ) : (
    <div className={cn('flex gap-1 flex-wrap', styles.pickerContainer)}>
      {QUICK_REACTIONS.map((emoji) => (
        <div className={styles.emojiButton} key={emoji} onClick={() => handleSelect(emoji)}>
          {emoji}
        </div>
      ))}
      <div className={styles.moreButton} onClick={() => setShowFullPicker(true)}>
        <PlusIcon size={16} />
      </div>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          isValidElement(trigger) ? (
            trigger
          ) : (
            <span {...(open ? { 'data-popup-open': '' } : {})}>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span style={{ display: 'inline-flex' }}>
                        <ActionIcon
                          aria-label={t('messageAction.reaction')}
                          icon={SmilePlus}
                          size="small"
                        />
                      </span>
                    }
                  />
                  <TooltipContent>{t('messageAction.reaction')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          )
        }
      />
      <PopoverContent className="p-0" side="top">
        {content}
      </PopoverContent>
    </Popover>
  );
});

ReactionPicker.displayName = 'ReactionPicker';

export default ReactionPicker;
