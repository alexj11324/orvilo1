import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Flexbox } from '@lobehub/ui';
import { Popover } from 'antd';
import { createStaticStyles, useTheme } from 'antd-style';
import { PlusIcon, SmilePlus } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useGlobalStore } from '@/store/global';
import { globalGeneralSelectors } from '@/store/global/selectors';
import { taskReactionSelectors, useTaskReactionStore } from '@/store/taskReactions';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const QUICK_REACTIONS = ['👍', '👎', '❤️', '😄', '😂', '😅', '🎉', '😢', '🤔', '🚀'];

const styles = createStaticStyles(({ css, cssVar }) => ({
  actionLink: css`
    cursor: pointer;

    display: flex;
    gap: 6px;
    align-items: center;

    width: fit-content;
    padding-block: 2px;
    border: none;

    font-size: 13px;
    color: ${cssVar.colorTextTertiary};

    background: transparent;

    &:hover {
      color: ${cssVar.colorText};
    }
  `,
  active: css`
    background: ${cssVar.colorFillTertiary};
  `,
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

/**
 * The issue's reaction strip under the description body: chips already added,
 * then the muted "Add reaction" affordance. Same shape as the message
 * reaction UI, backed by the issue-level store rather than message metadata.
 */
const TaskReactions = memo<{ taskId: string }>(({ taskId }) => {
  const { t } = useTranslation('chat');
  const theme = useTheme();
  const locale = useGlobalStore(globalGeneralSelectors.currentLanguage);
  const userId = useUserStore(userProfileSelectors.userId);
  const reactions = useTaskReactionStore(taskReactionSelectors.reactionsForTask(taskId));
  const addReaction = useTaskReactionStore((s) => s.addReaction);
  const removeReaction = useTaskReactionStore((s) => s.removeReaction);
  const [open, setOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);

  const handleSelect = (emoji: string) => {
    if (!userId) return;
    const mine = reactions.find((r) => r.emoji === emoji)?.users.includes(userId);
    if (mine) {
      removeReaction(taskId, emoji, userId);
    } else {
      addReaction(taskId, emoji, userId);
    }
    setOpen(false);
    setShowFullPicker(false);
  };

  const handleToggleChip = (emoji: string) => {
    if (!userId) return;
    const mine = reactions.find((r) => r.emoji === emoji)?.users.includes(userId);
    if (mine) {
      removeReaction(taskId, emoji, userId);
    } else {
      addReaction(taskId, emoji, userId);
    }
  };

  const picker = showFullPicker ? (
    <Picker
      data={data}
      locale={locale?.split('-')[0] || 'en'}
      previewPosition="none"
      skinTonePosition="none"
      theme={theme.appearance === 'dark' ? 'dark' : 'light'}
      onEmojiSelect={(emoji: { native?: string }) => {
        if (emoji.native) handleSelect(emoji.native);
      }}
    />
  ) : (
    <Flexbox horizontal className={styles.pickerContainer} gap={4} wrap="wrap">
      {QUICK_REACTIONS.map((emoji) => (
        <div className={styles.emojiButton} key={emoji} onClick={() => handleSelect(emoji)}>
          {emoji}
        </div>
      ))}
      <div
        className={styles.moreButton}
        title={t('taskDetail.reactions.more', { defaultValue: 'More reactions' })}
        onClick={() => setShowFullPicker(true)}
      >
        <PlusIcon size={16} />
      </div>
    </Flexbox>
  );

  return (
    <Flexbox horizontal align="center" gap={8} wrap="wrap">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`${styles.reactionTag} ${
            userId && reaction.users.includes(userId) ? styles.active : ''
          }`}
          onClick={() => handleToggleChip(reaction.emoji)}
        >
          <span>{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
      <Popover
        arrow={false}
        content={picker}
        open={open}
        placement="bottomLeft"
        trigger="click"
        onOpenChange={(visible) => {
          setOpen(visible);
          if (!visible) setShowFullPicker(false);
        }}
      >
        <button className={styles.actionLink} type="button">
          <SmilePlus size={14} />
          {t('taskDetail.reactions.add', { defaultValue: 'Add reaction' })}
        </button>
      </Popover>
    </Flexbox>
  );
});

export default TaskReactions;
