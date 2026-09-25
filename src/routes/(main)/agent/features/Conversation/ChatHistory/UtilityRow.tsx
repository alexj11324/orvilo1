'use client';

import { Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { History } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ChatHistoryMenu from './index';

const styles = createStaticStyles(({ css }) => ({
  // The reference's shared bottom-right utility row floats above page content
  // in the route's corner. The row container in `(chat)/_layout` is already
  // `position: relative`, so this anchors to the chat surface's bottom-right.
  row: css`
    pointer-events: none;

    position: absolute;
    z-index: 20;
    inset-block-end: 12px;
    inset-inline-end: 12px;

    display: flex;
    gap: 4px;
    align-items: center;
  `,
  // Same pill geometry as the header title trigger (28px / 9999r / 12px-500).
  trigger: css`
    pointer-events: auto;
    cursor: pointer;

    display: inline-flex;
    gap: 4px;
    align-items: center;

    height: 28px;
    padding-inline: 8px;
    border: none;
    border-radius: 9999px;

    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowTertiary};

    transition:
      background 0.15s,
      color 0.15s;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: -1px;
    }

    &[data-popup-open] {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }
  `,
}));

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
        <Icon icon={History} size={14} />
        <span>{t('chatHistory.title')}</span>
      </ChatHistoryMenu>
    </div>
  );
});

ChatHistoryUtilityRow.displayName = 'ChatHistoryUtilityRow';

export default ChatHistoryUtilityRow;
