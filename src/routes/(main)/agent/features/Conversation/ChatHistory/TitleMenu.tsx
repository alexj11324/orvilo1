'use client';

import { Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDown } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ChatHistoryMenu from './index';

const styles = createStaticStyles(({ css }) => ({
  label: css`
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  // Reference geometry: 28px-high pill trigger, 12px/500 type, 9999px radius,
  // 8px horizontal padding — Linear's `Switch agent chat` title button.
  trigger: css`
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    max-width: 100%;
    height: 28px;
    padding-inline: 8px;
    border: none;
    border-radius: 9999px;

    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    color: ${cssVar.colorText};

    background: transparent;

    transition: background 0.15s;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -1px;
    }

    &[data-popup-open] {
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

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
      <Icon icon={ChevronDown} size={14} />
    </ChatHistoryMenu>
  );
});

ChatHistoryTitleMenu.displayName = 'ChatHistoryTitleMenu';

export default ChatHistoryTitleMenu;
