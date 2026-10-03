'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import type { LucideIcon } from 'lucide-react';
import { createElement, memo, type ReactNode } from 'react';

const styles = createStaticStyles(({ css }) => ({
  card: css`
    padding-block: 16px 4px;
    padding-inline: 16px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  cardHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block-end: 12px;
  `,
  detailContent: css`
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;

    min-width: 0;
  `,
  detailLabel: css`
    flex-shrink: 0;

    width: 96px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  detailList: css`
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  detailRow: css`
    display: flex;
    gap: 16px;
    align-items: center;

    min-height: 44px;
    padding-block: 6px;

    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }
  `,
  hint: css`
    font-size: 12px;
    color: ${cssVar.colorTextDescription};
  `,
  select: css`
    min-width: 220px;
    max-width: 100%;
  `,
  title: css`
    font-size: 14px;
    font-weight: 500;
  `,
}));

export const settingsStyles = styles;

interface SettingsGroupProps {
  action?: ReactNode;
  children: ReactNode;
  icon?: LucideIcon;
  title: ReactNode;
}

/**
 * One compact settings group on the agent settings page — a bordered card
 * with a small icon + title header and labelled `SettingsRow` rows beneath.
 * Replaces the engine-card shell so every group (General / Model / Device /
 * Access / Connection) shares the same frame.
 */
export const SettingsGroup = memo<SettingsGroupProps>(({ action, children, icon, title }) => (
  <div className={cn('flex flex-col gap-0', styles.card)}>
    <div className={styles.cardHeader}>
      <div className="flex items-center gap-2">
        {icon ? createElement(icon, { size: 16 }) : null}
        <div className={cn('font-semibold', styles.title)}>{title}</div>
      </div>
      {action}
    </div>
    <div className={styles.detailList}>{children}</div>
  </div>
));

SettingsGroup.displayName = 'SettingsGroup';

interface SettingsRowProps {
  children: ReactNode;
  /** Left-hand row label; empty renders a spacer so content still aligns. */
  label?: ReactNode;
}

export const SettingsRow = memo<SettingsRowProps>(({ children, label }) => (
  <div className={styles.detailRow}>
    <div className={styles.detailLabel}>{label}</div>
    <div className={styles.detailContent}>{children}</div>
  </div>
));

SettingsRow.displayName = 'SettingsRow';
