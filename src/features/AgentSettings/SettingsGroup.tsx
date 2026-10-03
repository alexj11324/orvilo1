'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

const styles = createStaticStyles(({ css }) => ({
  detailContent: css`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    min-width: 0;
  `,
  detailLabel: css`
    font-size: 13px;
    color: ${cssVar.colorTextSecondary};
  `,
  detailRow: css`
    display: grid;
    gap: 6px 16px;
    align-items: center;

    min-height: 44px;
    padding-block: 8px;

    & + & {
      border-block-start: 1px solid ${cssVar.colorBorderSecondary};
    }

    @container (min-width: 560px) {
      &.has-label {
        grid-template-columns: minmax(140px, 180px) minmax(0, 1fr);
      }
    }
  `,
  group: css`
    padding-block: 8px 4px;

    & + & {
      margin-block-start: 16px;
    }
  `,
  groupHeader: css`
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;

    padding-block: 0 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
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
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextSecondary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
}));

export const settingsStyles = styles;

interface SettingsGroupProps {
  action?: ReactNode;
  children: ReactNode;
  title: ReactNode;
}

/**
 * One section on the agent settings page — a small uppercase section label
 * over a hairline with `SettingsRow` rows beneath. Sections are plain stacks,
 * not cards: only special states (warning / error / blocked) draw a bordered
 * surface, via `Alert`.
 */
export const SettingsGroup = memo<SettingsGroupProps>(({ action, children, title }) => (
  <div className={styles.group}>
    <div className={styles.groupHeader}>
      <div className={styles.title}>{title}</div>
      {action}
    </div>
    {children}
  </div>
));

SettingsGroup.displayName = 'SettingsGroup';

interface SettingsRowProps {
  children: ReactNode;
  /** Left-hand row label; absent rows span the full width with no label column. */
  label?: ReactNode;
}

export const SettingsRow = memo<SettingsRowProps>(({ children, label }) => (
  <div className={cn(styles.detailRow, label ? 'has-label' : undefined)}>
    {label ? <div className={styles.detailLabel}>{label}</div> : null}
    <div className={styles.detailContent}>{children}</div>
  </div>
));

SettingsRow.displayName = 'SettingsRow';
